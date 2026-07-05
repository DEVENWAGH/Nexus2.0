import { getAuth, getCurrentUser } from "@/lib/auth-wrapper";
import { prisma } from "@repo/db";
import { redirect } from "next/navigation";

export const initialProfile = async () => {
    const { userId } = await getAuth();

    if (!userId) {
        return redirect("/sign-in");
    }

    const profile = await prisma.profile.findUnique({
        where: {
            userId: userId,
        },
    });

    if (profile) {
        return profile;
    }

    // Only fetch full user from Clerk if we need to create a new profile
    const user = await getCurrentUser();
    if (!user) {
        return redirect("/sign-in");
    }

    const newProfile = await prisma.profile.create({
        data: {
            userId: user.id,
            name: `${user.firstName} ${user.lastName}`,
            imageUrl: user.imageUrl,
            email: user.emailAddresses[0].emailAddress,
        },
    });

    return newProfile;
};
