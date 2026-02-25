package api

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/pulse-chat/pulse/internal/models"
)

var urlRegex = regexp.MustCompile(`https?://[^\s<>"\x60]+`)

// ExtractURLs finds all URLs in a message content string.
func ExtractURLs(content string) []string {
	matches := urlRegex.FindAllString(content, 5) // max 5 URLs per message
	if matches == nil {
		return []string{}
	}

	// Deduplicate
	seen := make(map[string]bool, len(matches))
	unique := make([]string, 0, len(matches))
	for _, u := range matches {
		// Trim trailing punctuation that's likely not part of the URL
		u = strings.TrimRight(u, ".,;:!?)")
		if !seen[u] {
			seen[u] = true
			unique = append(unique, u)
		}
	}
	return unique
}

// FetchEmbeds fetches Open Graph / meta tag info for a list of URLs.
// This is done asynchronously and best-effort — failures are silently skipped.
func FetchEmbeds(ctx context.Context, urls []string) []models.Embed {
	if len(urls) == 0 {
		return nil
	}

	type result struct {
		embed models.Embed
		ok    bool
	}

	ch := make(chan result, len(urls))

	fetchCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	for _, u := range urls {
		go func(rawURL string) {
			embed, err := fetchOGData(fetchCtx, rawURL)
			if err != nil {
				ch <- result{ok: false}
				return
			}
			ch <- result{embed: embed, ok: true}
		}(u)
	}

	var embeds []models.Embed
	for range urls {
		r := <-ch
		if r.ok {
			embeds = append(embeds, r.embed)
		}
	}
	return embeds
}

// fetchOGData fetches a URL and extracts Open Graph meta tags.
func fetchOGData(ctx context.Context, rawURL string) (models.Embed, error) {
	client := &http.Client{
		Timeout: 4 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return models.Embed{}, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "PulseBot/1.0 (link preview)")
	req.Header.Set("Accept", "text/html")

	resp, err := client.Do(req)
	if err != nil {
		return models.Embed{}, fmt.Errorf("fetch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return models.Embed{}, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")

	// If it's an image, return a simple image embed
	if strings.HasPrefix(contentType, "image/") {
		return models.Embed{
			URL:  rawURL,
			Type: "image",
		}, nil
	}

	// Only parse HTML
	if !strings.Contains(contentType, "text/html") {
		return models.Embed{}, fmt.Errorf("not HTML: %s", contentType)
	}

	// Read limited body (max 256KB)
	body, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return models.Embed{}, fmt.Errorf("read body: %w", err)
	}

	html := string(body)
	embed := models.Embed{
		URL:  rawURL,
		Type: "link",
	}

	embed.Title = extractMetaContent(html, "og:title")
	if embed.Title == "" {
		embed.Title = extractHTMLTitle(html)
	}

	embed.Description = extractMetaContent(html, "og:description")
	if embed.Description == "" {
		embed.Description = extractMetaContent(html, "description")
	}

	embed.SiteName = extractMetaContent(html, "og:site_name")
	embed.ImageURL = extractMetaContent(html, "og:image")
	embed.Color = extractMetaContent(html, "theme-color")

	ogType := extractMetaContent(html, "og:type")
	if strings.HasPrefix(ogType, "video") {
		embed.Type = "video"
	}

	// Truncate description if too long
	if len(embed.Description) > 300 {
		embed.Description = embed.Description[:297] + "..."
	}

	// Only return if we got at least a title
	if embed.Title == "" {
		return models.Embed{}, fmt.Errorf("no title found")
	}

	return embed, nil
}

var (
	metaPropertyRegex = regexp.MustCompile(`(?i)<meta\s[^>]*property=["']([^"']+)["'][^>]*content=["']([^"']*)["']`)
	metaNameRegex     = regexp.MustCompile(`(?i)<meta\s[^>]*name=["']([^"']+)["'][^>]*content=["']([^"']*)["']`)
	metaContentFirst  = regexp.MustCompile(`(?i)<meta\s[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']([^"']+)["']`)
	titleTagRegex     = regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)
)

// extractMetaContent extracts content from meta tags by property or name attribute.
func extractMetaContent(html string, key string) string {
	// Try property="key" content="value"
	for _, match := range metaPropertyRegex.FindAllStringSubmatch(html, -1) {
		if len(match) >= 3 && strings.EqualFold(match[1], key) {
			return strings.TrimSpace(match[2])
		}
	}
	// Try name="key" content="value"
	for _, match := range metaNameRegex.FindAllStringSubmatch(html, -1) {
		if len(match) >= 3 && strings.EqualFold(match[1], key) {
			return strings.TrimSpace(match[2])
		}
	}
	// Try content="value" property="key" (reversed attribute order)
	for _, match := range metaContentFirst.FindAllStringSubmatch(html, -1) {
		if len(match) >= 3 && strings.EqualFold(match[2], key) {
			return strings.TrimSpace(match[1])
		}
	}
	return ""
}

// extractHTMLTitle extracts the <title> tag content.
func extractHTMLTitle(html string) string {
	match := titleTagRegex.FindStringSubmatch(html)
	if len(match) >= 2 {
		return strings.TrimSpace(match[1])
	}
	return ""
}
