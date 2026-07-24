// Validated access to server-only environment variables. Lazy getters (not
// top-level constants) so a missing var fails at request time with a clear
// message, instead of crashing the build or surfacing a cryptic `undefined`.
//
// These are all secrets — never import this from a Client Component.

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `Missing required environment variable ${name}. Set it in .env.local (see CLAUDE.md).`,
        );
    }
    return value;
}

export const serverEnv = {
    get supabaseUrl() {
        return required("SUPABASE_URL");
    },
    get supabaseServiceRoleKey() {
        return required("SUPABASE_SERVICE_ROLE_KEY");
    },
    get geminiApiKey() {
        return required("GEMINI_API_KEY");
    },
};
