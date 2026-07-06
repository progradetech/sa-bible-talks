// Records imported without a real contact email carry this placeholder in the
// database. Treat it as "no email" everywhere the admin UI renders, exports,
// or sends — the stored value is untouched.
export const PLACEHOLDER_EMAIL = 'luminarytech2020@gmail.com';
