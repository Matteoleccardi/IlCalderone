<?php
// Rebuild data/index/recipes.json from the recipe files (after editing or copying files by hand).
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { exit; }
require __DIR__ . '/../bootstrap.php';
$app = calderone_app();
$n = count($app->services['recipes']->rebuildIndex());
echo "indexed {$n} recipes in {$app->store->dir}\n";
