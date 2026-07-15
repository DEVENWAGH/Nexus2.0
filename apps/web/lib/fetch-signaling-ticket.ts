import axios from "axios";

export async function fetchSignalingTicket(
    roomId: string,
    peerId: string,
): Promise<string> {
    const res = await axios.post<{ ticket: string }>("/api/signaling/ticket", {
        roomId,
        peerId,
    });
    return res.data.ticket;
}
