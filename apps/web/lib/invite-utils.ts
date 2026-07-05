/**
 * extractInviteCode("http://localhost:3000/invite/abc-123") // returns "abc-123"
 */
export const extractInviteCode = (input: string): string => {
    try {
        const trimmed = input.trim();

        if (trimmed.includes("/invite/")) {
            const parts = trimmed.split("/invite/");
            return parts[parts.length - 1].split("?")[0].split("#")[0];
        }
        return trimmed;
    } catch {
        return input.trim();
    }
};
