package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Store wraps Redis client for caching and pub/sub
type Store struct {
	client *redis.Client
}

// New creates a new Redis cache store
func New(addr, password string) (*Store, error) {
	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           0,
		PoolSize:     25,
		MinIdleConns: 5,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}

	return &Store{client: client}, nil
}

// Close closes the Redis connection
func (s *Store) Close() error {
	return s.client.Close()
}

// Client returns the underlying Redis client
func (s *Store) Client() *redis.Client {
	return s.client
}

// Set stores a value with expiration
func (s *Store) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("marshal cache value: %w", err)
	}
	return s.client.Set(ctx, key, data, expiration).Err()
}

// Get retrieves a value from cache
func (s *Store) Get(ctx context.Context, key string, dest interface{}) error {
	data, err := s.client.Get(ctx, key).Bytes()
	if err != nil {
		return err
	}
	return json.Unmarshal(data, dest)
}

// Del removes a key from cache
func (s *Store) Del(ctx context.Context, keys ...string) error {
	return s.client.Del(ctx, keys...).Err()
}

// Exists checks if a key exists
func (s *Store) Exists(ctx context.Context, key string) (bool, error) {
	result, err := s.client.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return result > 0, nil
}

// --- Rate Limiting ---

// RateLimit checks if a key has exceeded the rate limit using sliding window
func (s *Store) RateLimit(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	now := time.Now().UnixNano()
	windowStart := now - int64(window)

	pipe := s.client.Pipeline()

	// Remove old entries
	pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart))
	// Add current request
	pipe.ZAdd(ctx, key, redis.Z{Score: float64(now), Member: now})
	// Count requests in window
	countCmd := pipe.ZCard(ctx, key)
	// Set expiry on the key
	pipe.Expire(ctx, key, window)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return false, fmt.Errorf("rate limit pipeline: %w", err)
	}

	count := countCmd.Val()
	return count > int64(limit), nil
}

// --- Presence ---

// SetUserOnline marks a user as online with a TTL
func (s *Store) SetUserOnline(ctx context.Context, userID string, ttl time.Duration) error {
	return s.client.Set(ctx, "presence:"+userID, "online", ttl).Err()
}

// SetUserPresence sets custom presence
func (s *Store) SetUserPresence(ctx context.Context, userID, status string, ttl time.Duration) error {
	return s.client.Set(ctx, "presence:"+userID, status, ttl).Err()
}

// GetUserPresence gets a user's presence
func (s *Store) GetUserPresence(ctx context.Context, userID string) (string, error) {
	result, err := s.client.Get(ctx, "presence:"+userID).Result()
	if err == redis.Nil {
		return "offline", nil
	}
	if err != nil {
		return "", err
	}
	return result, nil
}

// RemoveUserPresence removes a user's presence (goes offline)
func (s *Store) RemoveUserPresence(ctx context.Context, userID string) error {
	return s.client.Del(ctx, "presence:"+userID).Err()
}

// --- Pub/Sub ---

// Publish publishes a message to a channel
func (s *Store) Publish(ctx context.Context, channel string, message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("marshal publish message: %w", err)
	}
	return s.client.Publish(ctx, channel, data).Err()
}

// Subscribe subscribes to a Redis channel
func (s *Store) Subscribe(ctx context.Context, channels ...string) *redis.PubSub {
	return s.client.Subscribe(ctx, channels...)
}

// --- Session Storage ---

// SetSession stores a session
func (s *Store) SetSession(ctx context.Context, sessionID string, userID string, expiry time.Duration) error {
	return s.client.Set(ctx, "session:"+sessionID, userID, expiry).Err()
}

// GetSession retrieves a session
func (s *Store) GetSession(ctx context.Context, sessionID string) (string, error) {
	return s.client.Get(ctx, "session:"+sessionID).Result()
}

// DeleteSession removes a session
func (s *Store) DeleteSession(ctx context.Context, sessionID string) error {
	return s.client.Del(ctx, "session:"+sessionID).Err()
}
