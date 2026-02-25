package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps pgxpool.Pool for the application
type Pool struct {
	*pgxpool.Pool
}

// New creates a new database connection pool
func New(ctx context.Context, dsn string) (*Pool, error) {
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse db config: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return &Pool{pool}, nil
}

// RunMigrations executes SQL migration files in order
func (p *Pool) RunMigrations(ctx context.Context, migrationsDir string) error {
	// Create migrations tracking table
	_, err := p.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}

	// Get already applied migrations
	rows, err := p.Query(ctx, "SELECT version FROM schema_migrations ORDER BY version")
	if err != nil {
		return fmt.Errorf("query migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[string]bool)
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return fmt.Errorf("scan migration version: %w", err)
		}
		applied[version] = true
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate migrations: %w", err)
	}

	// Read migration files
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	var upFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".up.sql") {
			upFiles = append(upFiles, entry.Name())
		}
	}
	sort.Strings(upFiles)

	for _, file := range upFiles {
		version := strings.TrimSuffix(file, ".up.sql")
		if applied[version] {
			continue
		}

		content, err := os.ReadFile(filepath.Join(migrationsDir, file))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", file, err)
		}

		tx, err := p.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", file, err)
		}

		if _, err := tx.Exec(ctx, string(content)); err != nil {
			rbErr := tx.Rollback(ctx)
			if rbErr != nil {
				return fmt.Errorf("rollback failed for %s: %w (original: %v)", file, rbErr, err)
			}
			return fmt.Errorf("execute migration %s: %w", file, err)
		}

		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
			rbErr := tx.Rollback(ctx)
			if rbErr != nil {
				return fmt.Errorf("rollback failed for %s: %w (original: %v)", file, rbErr, err)
			}
			return fmt.Errorf("record migration %s: %w", file, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", file, err)
		}

		fmt.Printf("Applied migration: %s\n", file)
	}

	return nil
}
