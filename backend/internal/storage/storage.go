package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Client wraps MinIO client for file storage
type Client struct {
	minio  *minio.Client
	bucket string
}

// New creates a new MinIO storage client
func New(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*Client, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	return &Client{
		minio:  client,
		bucket: bucket,
	}, nil
}

// EnsureBucket creates the bucket if it doesn't exist
func (c *Client) EnsureBucket(ctx context.Context) error {
	exists, err := c.minio.BucketExists(ctx, c.bucket)
	if err != nil {
		return fmt.Errorf("check bucket: %w", err)
	}
	if !exists {
		err = c.minio.MakeBucket(ctx, c.bucket, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("create bucket: %w", err)
		}

		// Set bucket policy to allow public read for uploaded files
		policy := fmt.Sprintf(`{
			"Version": "2012-10-17",
			"Statement": [{
				"Effect": "Allow",
				"Principal": {"AWS": ["*"]},
				"Action": ["s3:GetObject"],
				"Resource": ["arn:aws:s3:::%s/*"]
			}]
		}`, c.bucket)

		err = c.minio.SetBucketPolicy(ctx, c.bucket, policy)
		if err != nil {
			return fmt.Errorf("set bucket policy: %w", err)
		}
	}
	return nil
}

// Upload uploads a file to MinIO
func (c *Client) Upload(ctx context.Context, objectName string, reader io.Reader, size int64, contentType string) (string, error) {
	_, err := c.minio.PutObject(ctx, c.bucket, objectName, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("upload file: %w", err)
	}

	return fmt.Sprintf("/storage/%s/%s", c.bucket, objectName), nil
}

// GetPresignedURL generates a presigned URL for temporary access
func (c *Client) GetPresignedURL(ctx context.Context, objectName string, expiry time.Duration) (string, error) {
	reqParams := make(url.Values)
	presignedURL, err := c.minio.PresignedGetObject(ctx, c.bucket, objectName, expiry, reqParams)
	if err != nil {
		return "", fmt.Errorf("presign url: %w", err)
	}
	return presignedURL.String(), nil
}

// Delete removes a file from MinIO
func (c *Client) Delete(ctx context.Context, objectName string) error {
	err := c.minio.RemoveObject(ctx, c.bucket, objectName, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("delete file: %w", err)
	}
	return nil
}

// AllowedMimeTypes returns a set of allowed MIME types for upload validation
var AllowedMimeTypes = map[string]bool{
	"image/jpeg":        true,
	"image/png":         true,
	"image/gif":         true,
	"image/webp":        true,
	"image/svg+xml":     true,
	"video/mp4":         true,
	"video/webm":        true,
	"audio/mpeg":        true,
	"audio/ogg":         true,
	"audio/wav":         true,
	"application/pdf":   true,
	"text/plain":        true,
	"application/zip":   true,
	"application/x-tar": true,
	"application/gzip":  true,
}

// ValidateMimeType checks if a MIME type is allowed
func ValidateMimeType(mimeType string) bool {
	return AllowedMimeTypes[mimeType]
}
