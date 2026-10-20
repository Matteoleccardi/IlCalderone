<?php
declare(strict_types=1);

/**
 * PHP sessions stored by the app itself, one file per session in data/sessions/.
 * PHP's own "files" handler is not used, because some hosts (Altervista among them) configure sessions their own way
 * and quietly drop what is saved in a custom folder. This handler behaves the same everywhere.
 */
final class FileSessions implements SessionHandlerInterface, SessionUpdateTimestampHandlerInterface
{
    public function __construct(private readonly string $dir)
    {
    }

    private function file(string $id): ?string
    {
        // ids are PHP-generated; anything else is refused (no paths)
        return preg_match('/^[A-Za-z0-9,-]{16,128}$/', $id) ? "{$this->dir}/sess_{$id}" : null;
    }

    public function open(string $path, string $name): bool
    {
        return is_dir($this->dir) || @mkdir($this->dir, 0775, true);
    }

    public function close(): bool
    {
        return true;
    }

    public function read(string $id): string|false
    {
        $f = $this->file($id);
        return $f && is_file($f) ? (string) file_get_contents($f) : '';
    }

    public function write(string $id, string $data): bool
    {
        $f = $this->file($id);
        if (!$f) {
            return false;
        }
        $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($tmp, $data) === false || !rename($tmp, $f)) {
            @unlink($tmp);
            return false;
        }
        return true;
    }

    public function destroy(string $id): bool
    {
        $f = $this->file($id);
        if ($f && is_file($f)) {
            @unlink($f);
        }
        return true;
    }

    public function gc(int $max_lifetime): int|false
    {
        $n = 0;
        foreach (glob("{$this->dir}/sess_*") ?: [] as $f) {
            if (filemtime($f) < time() - $max_lifetime && @unlink($f)) {
                $n++;
            }
        }
        return $n;
    }

    /** Strict mode: only ids of sessions that exist are accepted (others get a fresh id). */
    public function validateId(string $id): bool
    {
        $f = $this->file($id);
        return $f !== null && is_file($f);
    }

    public function updateTimestamp(string $id, string $data): bool
    {
        $f = $this->file($id);
        return $f !== null && is_file($f) ? touch($f) : $this->write($id, $data);
    }
}
