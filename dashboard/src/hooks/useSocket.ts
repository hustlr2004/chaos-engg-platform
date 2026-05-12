import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export function useSocket(room = "live-feed") {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const nextSocket = io("http://localhost:4000");
    setSocket(nextSocket);

    nextSocket.on("connect", () => {
      nextSocket.emit("join-room", room);
    });

    return () => {
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [room]);

  return socket;
}
