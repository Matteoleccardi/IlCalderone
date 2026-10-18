<?php
declare(strict_types=1);

/**
 * Error codes of the API, with an English fallback text.
 * The web app translates the code itself (web/src/i18n/*.ts, keys "err.<code>"), so these texts are only seen by
 * API clients and the CLI scripts. When you add a code here, add "err.<code>" to every language file too.
 * {name} placeholders are filled from the error's params.
 */
final class Messages
{
    public const EN = [
        // generic
        'not_found' => 'Not found',
        'method_not_allowed' => 'Method not allowed',
        'bad_json' => 'Invalid JSON',
        'bad_field' => 'Invalid field "{field}"',
        'csrf' => 'Security token missing or expired: reload the page',
        'internal' => 'Internal server error',
        // accounts
        'login_required' => 'Please log in',
        'admin_only' => 'Administrators only',
        'bad_credentials' => 'Wrong username or password',
        'too_many_attempts' => 'Too many attempts: try again in a few minutes',
        'username_invalid' => 'Username: 3–32 characters among letters, digits, . _ -',
        'username_taken' => 'Username already taken',
        'password_short' => 'The password must have at least 8 characters',
        'password_wrong' => 'The current password is not correct',
        'user_not_found' => 'User not found',
        'setup_done' => 'Setup has already been done',
        'cannot_delete_self' => 'You cannot delete your own account',
        // households
        'household_not_found' => 'Household not found',
        'household_name_required' => 'Give the household a name',
        'household_owner_only' => 'Only the household manager can do this',
        'household_no_user' => 'No user with this username',
        'household_already_member' => 'Already a member of the household',
        'not_in_household' => 'You are not a member of this household',
        // recipes
        'recipe_not_found' => 'Recipe not found',
        'recipe_edit_denied' => 'You cannot edit this recipe: create a variant instead',
        'recipe_delete_denied' => 'Only the creator of the recipe can do this',
        'recipe_title_required' => 'The recipe needs a title',
        'qty_invalid' => 'Invalid quantity "{value}" (use a number, 1/2 or q.b.)',
        'variant_cycle' => 'This link would create a cycle between variants',
        'revision_not_found' => 'Version not found',
        'photo_missing' => 'No photo sent',
        'photo_none' => 'No photo',
        'photo_upload_failed' => 'Photo upload failed',
        'photo_too_large' => 'Photo too large',
        'photo_type' => 'Unsupported format: use JPEG, PNG or WebP',
        'photo_save_failed' => 'Could not save the photo',
        'import_empty' => 'No recipes to import',
        'import_invalid_item' => 'Invalid item skipped',
        'import_format' => '"{title}": unsupported format',
        'import_exists' => '"{title}" already exists, skipped',
        'import_failed' => '"{title}": {reason}',
        // collections
        'collection_not_found' => 'Collection not found',
        'collection_edit_denied' => 'You cannot edit this collection',
        'collection_name_required' => 'Give the collection a name',
        // diary
        'date_invalid' => 'Invalid date',
        'meallog_empty' => 'Pick a recipe or write what you ate',
        'entry_not_found' => 'Entry not found',
        'diary_hidden' => 'You cannot see this diary',
        // menus
        'menu_not_found' => 'Menu not found',
        'menu_edit_denied' => 'You cannot edit this menu',
        'menu_name_required' => 'Give the menu a name',
        'menu_recipe_hidden' => '"{title}" is not visible to everyone who uses this menu',
        // shopping list and pantry
        'item_not_found' => 'Item not found',
        'item_name_required' => 'Write what to buy',
        'household_required' => 'Choose a household',
    ];

    public static function text(string $code, array $params = []): string
    {
        $t = self::EN[$code] ?? $code;
        foreach ($params as $k => $v) {
            if (is_scalar($v)) {
                $t = str_replace('{' . $k . '}', self::EN[(string) $v] ?? (string) $v, $t);
            }
        }
        return $t;
    }
}
