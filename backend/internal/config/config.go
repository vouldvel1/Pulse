package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	AppEnv   string
	Domain   string
	APIPort  string
	LogLevel string

	// Database
	Postgres PostgresConfig

	// Redis
	Redis RedisConfig

	// MinIO
	MinIO MinIOConfig

	// JWT
	JWT JWTConfig

	// Security
	BcryptCost     int
	MaxUploadSize  int64
	RateLimitRPS   int
	RateLimitBurst int

	// LiveKit (WebRTC media server)
	LiveKitAPIKey    string
	LiveKitAPISecret string
	LiveKitURL       string // Internal URL for Go SDK RoomServiceClient (ws://livekit:7880)
	LiveKitWSURL     string // Browser-facing URL returned to frontend (ws://127.0.0.1:7880)
}

type PostgresConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DB       string
}

func (p PostgresConfig) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		p.User, p.Password, p.Host, p.Port, p.DB)
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
}

func (r RedisConfig) Addr() string {
	return fmt.Sprintf("%s:%s", r.Host, r.Port)
}

type MinIOConfig struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
}

type JWTConfig struct {
	Secret        string
	AccessExpiry  time.Duration
	RefreshExpiry time.Duration
}

func Load() (*Config, error) {
	accessExpiry, err := time.ParseDuration(getEnv("JWT_ACCESS_EXPIRY", "15m"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_ACCESS_EXPIRY: %w", err)
	}

	refreshExpiry, err := time.ParseDuration(getEnv("JWT_REFRESH_EXPIRY", "168h"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_REFRESH_EXPIRY: %w", err)
	}

	bcryptCost, err := strconv.Atoi(getEnv("BCRYPT_COST", "12"))
	if err != nil {
		return nil, fmt.Errorf("invalid BCRYPT_COST: %w", err)
	}

	maxUpload, err := strconv.ParseInt(getEnv("MAX_UPLOAD_SIZE", "52428800"), 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid MAX_UPLOAD_SIZE: %w", err)
	}

	rps, err := strconv.Atoi(getEnv("RATE_LIMIT_RPS", "60"))
	if err != nil {
		return nil, fmt.Errorf("invalid RATE_LIMIT_RPS: %w", err)
	}

	burst, err := strconv.Atoi(getEnv("RATE_LIMIT_BURST", "120"))
	if err != nil {
		return nil, fmt.Errorf("invalid RATE_LIMIT_BURST: %w", err)
	}

	useSSL := getEnv("MINIO_USE_SSL", "false") == "true"

	return &Config{
		AppEnv:   getEnv("APP_ENV", "production"),
		Domain:   getEnv("DOMAIN", "localhost"),
		APIPort:  getEnv("API_PORT", "8080"),
		LogLevel: getEnv("API_LOG_LEVEL", "info"),
		Postgres: PostgresConfig{
			Host:     getEnv("POSTGRES_HOST", "localhost"),
			Port:     getEnv("POSTGRES_PORT", "5432"),
			User:     getEnv("POSTGRES_USER", "pulse"),
			Password: getEnv("POSTGRES_PASSWORD", ""),
			DB:       getEnv("POSTGRES_DB", "pulse"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnv("REDIS_PORT", "6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
		},
		MinIO: MinIOConfig{
			Endpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
			AccessKey: getEnv("MINIO_ROOT_USER", ""),
			SecretKey: getEnv("MINIO_ROOT_PASSWORD", ""),
			Bucket:    getEnv("MINIO_BUCKET", "pulse-uploads"),
			UseSSL:    useSSL,
		},
		JWT: JWTConfig{
			Secret:        getEnv("JWT_SECRET", ""),
			AccessExpiry:  accessExpiry,
			RefreshExpiry: refreshExpiry,
		},
		BcryptCost:       bcryptCost,
		MaxUploadSize:    maxUpload,
		RateLimitRPS:     rps,
		RateLimitBurst:   burst,
		LiveKitAPIKey:    getEnv("LIVEKIT_API_KEY", "devkey"),
		LiveKitAPISecret: getEnv("LIVEKIT_API_SECRET", ""),
		LiveKitURL:       getEnv("LIVEKIT_URL", "ws://livekit:7880"),
		LiveKitWSURL:     getEnv("LIVEKIT_WS_URL", "ws://127.0.0.1:7880"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
