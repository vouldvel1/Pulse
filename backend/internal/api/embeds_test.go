package api

import (
	"net"
	"strings"
	"testing"
)

// ---- ExtractURLs ----

func TestExtractURLs_SingleURL(t *testing.T) {
	urls := ExtractURLs("Check out https://example.com for more")
	if len(urls) != 1 {
		t.Fatalf("want 1 url, got %d: %v", len(urls), urls)
	}
	if urls[0] != "https://example.com" {
		t.Errorf("want https://example.com, got %s", urls[0])
	}
}

func TestExtractURLs_MultipleURLs(t *testing.T) {
	urls := ExtractURLs("Visit https://a.com and http://b.org today")
	if len(urls) != 2 {
		t.Fatalf("want 2 urls, got %d: %v", len(urls), urls)
	}
}

func TestExtractURLs_TrimsTrailingPunctuation(t *testing.T) {
	urls := ExtractURLs("See https://example.com.")
	if len(urls) != 1 {
		t.Fatalf("want 1 url, got %d", len(urls))
	}
	if strings.HasSuffix(urls[0], ".") {
		t.Errorf("trailing period should be trimmed, got %s", urls[0])
	}
}

func TestExtractURLs_Deduplication(t *testing.T) {
	urls := ExtractURLs("https://example.com https://example.com")
	if len(urls) != 1 {
		t.Fatalf("want 1 (deduplicated) url, got %d: %v", len(urls), urls)
	}
}

func TestExtractURLs_MaxFiveURLs(t *testing.T) {
	content := "https://a.com https://b.com https://c.com https://d.com https://e.com https://f.com"
	urls := ExtractURLs(content)
	if len(urls) > 5 {
		t.Errorf("max 5 urls expected, got %d", len(urls))
	}
}

func TestExtractURLs_NoURLs(t *testing.T) {
	urls := ExtractURLs("hello world, no links here!")
	if len(urls) != 0 {
		t.Errorf("want 0 urls, got %d", len(urls))
	}
}

func TestExtractURLs_EmptyString(t *testing.T) {
	urls := ExtractURLs("")
	if len(urls) != 0 {
		t.Errorf("want 0 urls for empty string, got %d", len(urls))
	}
}

func TestExtractURLs_TrimsTrailingComma(t *testing.T) {
	urls := ExtractURLs("https://example.com,")
	if len(urls) != 1 {
		t.Fatalf("want 1 url, got %d", len(urls))
	}
	if strings.HasSuffix(urls[0], ",") {
		t.Errorf("trailing comma should be trimmed, got %s", urls[0])
	}
}

func TestExtractURLs_TrimsTrailingParen(t *testing.T) {
	urls := ExtractURLs("(see https://example.com)")
	if len(urls) != 1 {
		t.Fatalf("want 1 url, got %d", len(urls))
	}
	if strings.HasSuffix(urls[0], ")") {
		t.Errorf("trailing paren should be trimmed, got %s", urls[0])
	}
}

// ---- isPrivateIP ----

func TestIsPrivateIP_Loopback(t *testing.T) {
	if !isPrivateIP(net.ParseIP("127.0.0.1")) {
		t.Error("127.0.0.1 should be private")
	}
}

func TestIsPrivateIP_IPv6Loopback(t *testing.T) {
	if !isPrivateIP(net.ParseIP("::1")) {
		t.Error("::1 should be private")
	}
}

func TestIsPrivateIP_RFC1918_10(t *testing.T) {
	if !isPrivateIP(net.ParseIP("10.0.0.1")) {
		t.Error("10.0.0.1 should be private")
	}
}

func TestIsPrivateIP_RFC1918_172(t *testing.T) {
	if !isPrivateIP(net.ParseIP("172.16.0.1")) {
		t.Error("172.16.0.1 should be private")
	}
}

func TestIsPrivateIP_RFC1918_172_End(t *testing.T) {
	if !isPrivateIP(net.ParseIP("172.31.255.254")) {
		t.Error("172.31.255.254 should be private")
	}
}

func TestIsPrivateIP_RFC1918_192(t *testing.T) {
	if !isPrivateIP(net.ParseIP("192.168.1.100")) {
		t.Error("192.168.1.100 should be private")
	}
}

func TestIsPrivateIP_LinkLocal(t *testing.T) {
	if !isPrivateIP(net.ParseIP("169.254.0.1")) {
		t.Error("169.254.0.1 should be private (link-local)")
	}
}

func TestIsPrivateIP_SharedSpace(t *testing.T) {
	if !isPrivateIP(net.ParseIP("100.64.0.1")) {
		t.Error("100.64.0.1 should be private (RFC 6598 shared space)")
	}
}

func TestIsPrivateIP_Public(t *testing.T) {
	publicIPs := []string{
		"8.8.8.8",
		"1.1.1.1",
		"203.0.113.1",
		"198.51.100.1",
	}
	for _, ip := range publicIPs {
		if isPrivateIP(net.ParseIP(ip)) {
			t.Errorf("%s should NOT be private", ip)
		}
	}
}

func TestIsPrivateIP_Nil(t *testing.T) {
	if isPrivateIP(nil) {
		t.Error("nil IP should return false")
	}
}

func TestIsPrivateIP_IPv6UniqueLocal(t *testing.T) {
	if !isPrivateIP(net.ParseIP("fd00::1")) {
		t.Error("fd00::1 (IPv6 unique local) should be private")
	}
}

// ---- extractMetaContent ----

func TestExtractMetaContent_OGProperty(t *testing.T) {
	html := `<meta property="og:title" content="Hello World">`
	got := extractMetaContent(html, "og:title")
	if got != "Hello World" {
		t.Errorf("want 'Hello World', got %q", got)
	}
}

func TestExtractMetaContent_NameAttribute(t *testing.T) {
	html := `<meta name="description" content="A nice description">`
	got := extractMetaContent(html, "description")
	if got != "A nice description" {
		t.Errorf("want 'A nice description', got %q", got)
	}
}

func TestExtractMetaContent_ContentFirst(t *testing.T) {
	html := `<meta content="ReversedSite" property="og:site_name">`
	got := extractMetaContent(html, "og:site_name")
	if got != "ReversedSite" {
		t.Errorf("want 'ReversedSite', got %q", got)
	}
}

func TestExtractMetaContent_NotFound(t *testing.T) {
	html := `<meta property="og:title" content="Hello">`
	got := extractMetaContent(html, "og:description")
	if got != "" {
		t.Errorf("want empty string, got %q", got)
	}
}

func TestExtractMetaContent_CaseInsensitive(t *testing.T) {
	html := `<meta property="OG:TITLE" content="Upper">`
	got := extractMetaContent(html, "og:title")
	if got != "Upper" {
		t.Errorf("case-insensitive match failed, got %q", got)
	}
}

func TestExtractMetaContent_TrimsWhitespace(t *testing.T) {
	html := `<meta property="og:title" content="  Padded  ">`
	got := extractMetaContent(html, "og:title")
	if got != "Padded" {
		t.Errorf("expected trimmed value, got %q", got)
	}
}

// ---- extractHTMLTitle ----

func TestExtractHTMLTitle_Found(t *testing.T) {
	html := `<html><head><title>My Page</title></head></html>`
	got := extractHTMLTitle(html)
	if got != "My Page" {
		t.Errorf("want 'My Page', got %q", got)
	}
}

func TestExtractHTMLTitle_NotFound(t *testing.T) {
	html := `<html><head></head></html>`
	got := extractHTMLTitle(html)
	if got != "" {
		t.Errorf("want empty, got %q", got)
	}
}

func TestExtractHTMLTitle_TrimsWhitespace(t *testing.T) {
	html := `<title>  Spaced  </title>`
	got := extractHTMLTitle(html)
	if got != "Spaced" {
		t.Errorf("expected trimmed title, got %q", got)
	}
}
