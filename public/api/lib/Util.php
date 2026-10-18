<?php
declare(strict_types=1);

final class Util
{
    /** 32-char random hex id (same shape as the uuid hex ids of the seed recipes). */
    public static function id(): string
    {
        return bin2hex(random_bytes(16));
    }

    public static function isId(string $s): bool
    {
        return (bool) preg_match('/^[a-f0-9]{8,64}$/', $s);
    }

    public static function now(): string
    {
        return gmdate('Y-m-d\TH:i:s\Z');
    }

    /** Lower-case that works without the mbstring extension (handles Italian accented capitals). */
    public static function lower(string $s): string
    {
        if (function_exists('mb_strtolower')) {
            return mb_strtolower($s, 'UTF-8');
        }
        return strtr(strtolower($s), ['À' => 'à', 'È' => 'è', 'É' => 'é', 'Ì' => 'ì', 'Ò' => 'ò', 'Ó' => 'ó', 'Ù' => 'ù', 'Ç' => 'ç']);
    }

    /** Cut a UTF-8 string to at most $max characters without splitting a character. */
    public static function clip(string $s, int $max): string
    {
        if (preg_match('/^.{0,' . $max . '}/us', $s, $m)) {
            return $m[0];
        }
        return substr($s, 0, $max); // invalid UTF-8: byte cut
    }

    /** Collapse whitespace. */
    public static function squash(string $s): string
    {
        return trim(preg_replace('/\s+/u', ' ', $s) ?? $s);
    }

    /** Days since 1970-01-01 for a Y-m-d date (calendar arithmetic without time-zone/DST surprises). */
    public static function dayNumber(string $ymd): int
    {
        return intdiv((new DateTimeImmutable($ymd . ' 00:00:00', new DateTimeZone('UTC')))->getTimestamp(), 86400);
    }

    public static function addDays(string $ymd, int $days): string
    {
        return gmdate('Y-m-d', (self::dayNumber($ymd) + $days) * 86400);
    }

    /** Monday of the week containing $ymd. */
    public static function monday(string $ymd): string
    {
        return self::addDays($ymd, -(((self::dayNumber($ymd) + 3) % 7 + 7) % 7)); // 1970-01-01 was a Thursday
    }

    /** ISO weekday, 1 = Monday … 7 = Sunday. */
    public static function weekday(string $ymd): int
    {
        return ((self::dayNumber($ymd) + 3) % 7 + 7) % 7 + 1;
    }

    public static function isDate(string $s): bool
    {
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $s);
        return $d !== false && $d->format('Y-m-d') === $s;
    }
}
