import { getAuth } from "@/lib/auth-wrapper";
import { prisma } from "@repo/db";

export const CurrentProfile = async () => {
    const { userId } = await getAuth();

    if (!userId) {
        return null;
    }
    const profile = prisma.profile.findUnique({
        where: {
            userId,
        },
    });

    return profile;
};
