import { Server as NetServer, Socket } from "net";
import { NextApiResponse } from "next";
import { Server as SocketIOServer } from "socket.io";

import type { Member, Profile, Server } from "@repo/db";

export type ServerWithMembersWithProfile = Server & {
    members: (Member & { profile: Profile })[];
};

export type NextApiResponseServerIo = NextApiResponse & {
    socket: Socket & {
        server: NetServer & {
            io: SocketIOServer;
        };
    };
};
