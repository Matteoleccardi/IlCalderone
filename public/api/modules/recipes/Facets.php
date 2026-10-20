<?php
declare(strict_types=1);

/**
 * The fixed recipe classification (facets.json): course, diet, base ingredients, kind of dish, served hot/cold,
 * season, cuisine. A recipe stores {"facets": {facet: value | [values]}} with the keys of that file.
 */
final class Facets
{
    private static ?array $def = null;

    /** Old free-text "category" values (any case) → course key. */
    private const LEGACY = [
        'antipasto' => 'antipasto', 'antipasti' => 'antipasto', 'primo' => 'primo', 'primi' => 'primo', 'primo piatto' => 'primo',
        'secondo' => 'secondo', 'secondi' => 'secondo', 'secondo piatto' => 'secondo', 'contorno' => 'contorno',
        'contorni' => 'contorno', 'piatto unico' => 'piatto_unico', 'piatti unici' => 'piatto_unico', 'dolce' => 'dolce',
        'dolci' => 'dolce', 'dessert' => 'dolce', 'colazione' => 'colazione', 'merenda' => 'merenda', 'snack' => 'merenda',
        'salsa' => 'salsa', 'salse' => 'salsa', 'condimento' => 'salsa', 'pane' => 'pane', 'lievitati' => 'pane',
        'bevanda' => 'bevanda', 'bevande' => 'bevanda',
    ];

    /** facet => ['multi' => bool, 'max' => ?int, 'required' => bool, 'values' => [...], 'filter_includes' => [...]] */
    public static function def(): array
    {
        if (self::$def === null) {
            $raw = json_decode((string) file_get_contents(__DIR__ . '/facets.json'), true);
            self::$def = [];
            foreach ($raw['facets'] as $name => $f) {
                self::$def[$name] = [
                    'multi' => !empty($f['multi']), 'max' => $f['max'] ?? null, 'required' => !empty($f['required']),
                    'values' => $f['values'], 'filter_includes' => $f['filter_includes'] ?? [],
                ];
            }
        }
        return self::$def;
    }

    /** Every facet, empty: null for single ones, [] for multi ones. */
    public static function blank(): array
    {
        $out = [];
        foreach (self::def() as $name => $f) {
            $out[$name] = $f['multi'] ? [] : null;
        }
        return $out;
    }

    /** Keep only known facets and values (in the official order), respecting single/multi and max. */
    public static function clean(mixed $in): array
    {
        $out = self::blank();
        if (!is_array($in)) {
            return $out;
        }
        foreach (self::def() as $name => $f) {
            $v = $in[$name] ?? null;
            if ($f['multi']) {
                $given = is_array($v) ? $v : ($v === null || $v === '' ? [] : [$v]);
                $vals = array_values(array_filter($f['values'], fn($x) => in_array($x, $given, true)));
                $out[$name] = $f['max'] ? array_slice($vals, 0, $f['max']) : $vals;
            } else {
                $out[$name] = is_string($v) && in_array($v, $f['values'], true) ? $v : null;
            }
        }
        return $out;
    }

    /** Names of the required facets that are empty. */
    public static function missing(array $facets): array
    {
        $out = [];
        foreach (self::def() as $name => $f) {
            if ($f['required'] && empty($facets[$name])) {
                $out[] = $name;
            }
        }
        return $out;
    }

    /** Course key for an old free-text category, or null. */
    public static function courseFromCategory(string $category): ?string
    {
        $c = trim(preg_replace('/\s+/', ' ', Util::lower($category)) ?? '');
        $key = str_replace(' ', '_', $c);
        if (in_array($key, self::def()['course']['values'], true)) {
            return $key;
        }
        return self::LEGACY[$c] ?? null;
    }

    /**
     * Filters from the list query: facet => [values]. Within a facet any value matches; all facets must match.
     * "vegetariana" also matches vegan dishes (filter_includes).
     */
    public static function matches(array $facets, array $filters): bool
    {
        $def = self::def();
        foreach ($filters as $name => $wanted) {
            if (!isset($def[$name]) || !$wanted) {
                continue;
            }
            foreach ($wanted as $w) {
                foreach ($def[$name]['filter_includes'][$w] ?? [] as $extra) {
                    $wanted[] = $extra;
                }
            }
            $have = $facets[$name] ?? null;
            $have = is_array($have) ? $have : ($have === null ? [] : [$have]);
            if (!array_intersect($have, $wanted)) {
                return false;
            }
        }
        return true;
    }

    /** Filters from query parameters like ?course=primo,secondo&diet=vegana (unknown values are dropped). */
    public static function filtersFromQuery(array $query): array
    {
        $out = [];
        foreach (self::def() as $name => $f) {
            $v = $query[$name] ?? '';
            if (!is_string($v) || $v === '') {
                continue;
            }
            $vals = array_values(array_intersect(explode(',', $v), $f['values']));
            if ($vals) {
                $out[$name] = $vals;
            }
        }
        return $out;
    }
}
