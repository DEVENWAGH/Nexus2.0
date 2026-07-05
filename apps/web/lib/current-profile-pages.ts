import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
import { NextApiRequest } from "next";

export const CurrentProfilePages = async (req: NextApiRequest) => {
    const { userId } = getAuth(req);

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
