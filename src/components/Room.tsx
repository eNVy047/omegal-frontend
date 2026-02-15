import { Device } from "mediasoup-client";
import { useEffect, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";

const URL = "http://localhost:3000";
// const URL = "https://omega-backend-1.onrender.com";

interface UserMetadata {
    name: string;
    gender: string;
}

export const Room = ({
    name,
    gender,
    localAudioTrack,
    localVideoTrack
}: {
    name: string,
    gender: string,
    localAudioTrack: MediaStreamTrack | null,
    localVideoTrack: MediaStreamTrack | null,
}) => {
    const [lobby, setLobby] = useState(true);
    const [skippedMessage, setSkippedMessage] = useState(false);
    const [isVideoMuted, setIsVideoMuted] = useState(false);
    const [isAudioMuted, setIsAudioMuted] = useState(false);
    const [isPartnerVideoMuted, setIsPartnerVideoMuted] = useState(false);
    const [isPartnerAudioMuted, setIsPartnerAudioMuted] = useState(false);
    const [partnerMetadata, setPartnerMetadata] = useState<UserMetadata | null>(null);
    const [selfMetadata, setSelfMetadata] = useState<UserMetadata | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const deviceRef = useRef<Device | null>(null);
    const sendTransportRef = useRef<any>(null);
    const recvTransportRef = useRef<any>(null);
    const videoProducerRef = useRef<any>(null);
    const audioProducerRef = useRef<any>(null);
    const roomIdRef = useRef<string | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const pendingProducersRef = useRef<any[]>([]);
    const remoteStreamRef = useRef<MediaStream | null>(null);

    const consumeProducer = async (producerId: string) => {
        if (!recvTransportRef.current || !deviceRef.current || !roomIdRef.current) {
            console.log("Queuing producer:", producerId);
            pendingProducersRef.current.push(producerId);
            return;
        }

        console.log("Consuming producer:", producerId);
        socketRef.current?.emit("consume", {
            roomId: roomIdRef.current,
            transportId: recvTransportRef.current.id,
            producerId,
            rtpCapabilities: deviceRef.current.rtpCapabilities
        }, async (params: any) => {
            console.log("Consumer params received", params);
            const consumer = await recvTransportRef.current.consume(params);
            const { track } = consumer;

            if (!remoteStreamRef.current) {
                remoteStreamRef.current = new MediaStream();
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = remoteStreamRef.current;
                }
            }

            const stream = remoteStreamRef.current;

            // Remove existing tracks of the same kind to prevent duplicates
            stream.getTracks().forEach(t => {
                if (t.kind === track.kind) {
                    console.log(`Removing old ${track.kind} track`);
                    stream.removeTrack(t);
                    t.stop();
                }
            });

            console.log(`Adding new ${track.kind} track to remote stream`);
            stream.addTrack(track);

            if (remoteVideoRef.current) {
                remoteVideoRef.current.play().catch(e => console.error("Remote video play error:", e));
            }

            // Resume the consumer on the server
            socketRef.current?.emit("resume-consumer", { roomId: roomIdRef.current, consumerId: consumer.id });
        });
    };

    useEffect(() => {
        const socket = io(URL, {
            query: { name, gender }
        });
        socketRef.current = socket;

        socket.on("room-ready", async ({ roomId, rtpCapabilities, partnerMetadata, selfMetadata }) => {
            console.log("Room ready, loading device...");
            setLobby(false);
            setSkippedMessage(false);
            setIsPartnerVideoMuted(false);
            setIsPartnerAudioMuted(false);
            setPartnerMetadata(partnerMetadata);
            setSelfMetadata(selfMetadata);
            roomIdRef.current = roomId;

            const device = new Device();
            await device.load({ routerRtpCapabilities: rtpCapabilities });
            deviceRef.current = device;

            // Create Send Transport
            socket.emit("create-transport", { roomId }, async (params: any) => {
                const transport = device.createSendTransport(params);
                sendTransportRef.current = transport;

                transport.on("connect", ({ dtlsParameters }, callback) => {
                    socket.emit("connect-transport", { roomId, transportId: transport.id, dtlsParameters });
                    callback();
                });

                transport.on("produce", async ({ kind, rtpParameters }, callback) => {
                    socket.emit("produce", { roomId, transportId: transport.id, kind, rtpParameters }, ({ id }: any) => {
                        callback({ id });
                    });
                });

                if (localVideoTrack) {
                    const videoProducer = await transport.produce({ track: localVideoTrack });
                    videoProducerRef.current = videoProducer;
                }
                if (localAudioTrack) {
                    const audioProducer = await transport.produce({ track: localAudioTrack });
                    audioProducerRef.current = audioProducer;
                }
            });

            // Create Recv Transport
            socket.emit("create-transport", { roomId }, async (params: any) => {
                const transport = device.createRecvTransport(params);
                recvTransportRef.current = transport;

                transport.on("connect", ({ dtlsParameters }, callback) => {
                    socket.emit("connect-transport", { roomId, transportId: transport.id, dtlsParameters });
                    callback();
                });

                // Flush pending producers
                console.log("Recv transport ready, flushing producers:", pendingProducersRef.current.length);
                while (pendingProducersRef.current.length > 0) {
                    const pid = pendingProducersRef.current.shift();
                    consumeProducer(pid);
                }
            });
        });

        socket.on("new-producer", async ({ producerId }) => {
            consumeProducer(producerId);
        });

        socket.on("partner-skipped", () => {
            console.log("Partner skipped you!");
            setSkippedMessage(true);
            setLobby(true);
            setPartnerMetadata(null);
            // Cleanup transports
            sendTransportRef.current?.close();
            recvTransportRef.current?.close();
            sendTransportRef.current = null;
            recvTransportRef.current = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        });

        socket.on("lobby", () => {
            setLobby(true);
            setSkippedMessage(false);
            setIsPartnerVideoMuted(false);
            setIsPartnerAudioMuted(false);
            setPartnerMetadata(null);
            pendingProducersRef.current = [];
            // Cleanup transports
            sendTransportRef.current?.close();
            recvTransportRef.current?.close();
            sendTransportRef.current = null;
            recvTransportRef.current = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        });

        return () => {
            socket.disconnect();
        };
    }, [name, gender, localAudioTrack, localVideoTrack]);

    const toggleVideo = async () => {
        if (videoProducerRef.current) {
            if (isVideoMuted) {
                await videoProducerRef.current.resume();
                setIsVideoMuted(false);
            } else {
                await videoProducerRef.current.pause();
                setIsVideoMuted(true);
            }
        }
    };

    const toggleAudio = async () => {
        if (audioProducerRef.current) {
            if (isAudioMuted) {
                await audioProducerRef.current.resume();
                setIsAudioMuted(false);
            } else {
                await audioProducerRef.current.pause();
                setIsAudioMuted(true);
            }
        }
    };

    const handleNext = () => {
        socketRef.current?.emit("next");
    };

    useEffect(() => {
        if (localVideoRef.current && localVideoTrack) {
            localVideoRef.current.srcObject = new MediaStream([localVideoTrack]);
            localVideoRef.current.play().catch(e => console.error(e));
        }
    }, [localVideoTrack]);

    return (
        <div style={{
            minHeight: "100vh",
            background: "#f8f9fa",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
            fontFamily: "'Inter', sans-serif"
        }}>
            <header style={{
                width: "100%",
                padding: "20px 40px",
                background: "white",
                boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
            }}>
                <h2 style={{ color: "#007bff", fontSize: "1.5rem", margin: 0, fontWeight: "800" }}>Omegle Clone (SFU)</h2>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#4caf50" }}></div>
                    <span style={{ fontSize: "0.9rem", color: "#666" }}>Live Session</span>
                </div>
            </header>

            <div style={{
                display: "flex",
                gap: "24px",
                flexWrap: "wrap",
                justifyContent: "center",
                width: "100%",
                maxWidth: "1200px",
                padding: "0 20px",
                marginTop: "20px"
            }}>
                {/* Local Video Container */}
                <div style={{
                    position: "relative",
                    flex: "1",
                    minWidth: "300px",
                    maxWidth: "500px",
                    aspectRatio: "4/3",
                    border: "1px solid #ddd",
                    borderRadius: "20px",
                    overflow: "hidden",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                    background: "#000"
                }}>
                    <video autoPlay muted playsInline width="100%" height="100%" ref={localVideoRef} style={{
                        objectFit: "cover",
                        display: isVideoMuted ? "none" : "block"
                    }} />

                    {isVideoMuted && (
                        <div style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#222",
                            color: "white",
                            flexDirection: "column",
                            gap: "10px"
                        }}>
                            <div style={{
                                width: "80px",
                                height: "80px",
                                borderRadius: "50%",
                                background: "#444",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "2rem",
                                fontWeight: "bold",
                                textTransform: "uppercase"
                            }}>
                                {(selfMetadata?.name || name).charAt(0)}
                            </div>
                            <span style={{ fontSize: "1.1rem", fontWeight: "600" }}>Camera Off</span>
                        </div>
                    )}

                    <div style={{
                        position: "absolute",
                        bottom: "16px",
                        left: "16px",
                        background: "rgba(0,0,0,0.7)",
                        backdropFilter: "blur(5px)",
                        color: "white",
                        padding: "8px 16px",
                        borderRadius: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                        zIndex: 10
                    }}>
                        <span style={{ fontWeight: "bold", fontSize: "0.9rem" }}>{selfMetadata?.name || name} (You)</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>{selfMetadata?.gender || gender}</span>
                            {isAudioMuted && <span style={{ fontSize: "0.75rem", color: "#ff4d4d", fontWeight: "bold" }}>● Muted</span>}
                        </div>
                    </div>

                    {/* Local Controls Overlay */}
                    <div style={{
                        position: "absolute",
                        top: "16px",
                        right: "16px",
                        display: "flex",
                        gap: "8px",
                        zIndex: 20
                    }}>
                        <button onClick={toggleAudio} style={{
                            background: isAudioMuted ? "#ff4d4d" : "rgba(255,255,255,0.2)",
                            backdropFilter: "blur(10px)",
                            border: "none",
                            borderRadius: "10px",
                            padding: "8px",
                            cursor: "pointer",
                            width: "40px",
                            height: "40px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s"
                        }}>
                            {isAudioMuted ? "🔇" : "🎤"}
                        </button>
                        <button onClick={toggleVideo} style={{
                            background: isVideoMuted ? "#ff4d4d" : "rgba(255,255,255,0.2)",
                            backdropFilter: "blur(10px)",
                            border: "none",
                            borderRadius: "10px",
                            padding: "8px",
                            cursor: "pointer",
                            width: "40px",
                            height: "40px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s"
                        }}>
                            {isVideoMuted ? "📵" : "📷"}
                        </button>
                    </div>
                </div>

                {/* Remote Video Container */}
                <div style={{
                    position: "relative",
                    flex: "1",
                    minWidth: "300px",
                    maxWidth: "500px",
                    aspectRatio: "4/3",
                    border: "1px solid #ddd",
                    borderRadius: "20px",
                    overflow: "hidden",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                    background: "#000"
                }}>
                    <video autoPlay playsInline width="100%" height="100%" ref={remoteVideoRef} style={{
                        objectFit: "cover",
                        display: isPartnerVideoMuted ? "none" : "block"
                    }} />

                    {isPartnerVideoMuted && (
                        <div style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#222",
                            color: "white",
                            flexDirection: "column",
                            gap: "10px"
                        }}>
                            <div style={{
                                width: "80px",
                                height: "80px",
                                borderRadius: "50%",
                                background: "#444",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "2rem",
                                fontWeight: "bold",
                                textTransform: "uppercase"
                            }}>
                                {partnerMetadata?.name.charAt(0)}
                            </div>
                            <span style={{ fontSize: "1.1rem", fontWeight: "600" }}>Camera Off</span>
                        </div>
                    )}

                    {partnerMetadata && (
                        <div style={{
                            position: "absolute",
                            bottom: "16px",
                            left: "16px",
                            background: "rgba(0,0,0,0.7)",
                            backdropFilter: "blur(5px)",
                            color: "white",
                            padding: "8px 16px",
                            borderRadius: "12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                            zIndex: 10
                        }}>
                            <span style={{ fontWeight: "bold", fontSize: "0.9rem" }}>{partnerMetadata.name}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>{partnerMetadata.gender}</span>
                                {isPartnerAudioMuted && <span style={{ fontSize: "0.75rem", color: "#ff4d4d", fontWeight: "bold" }}>● Muted</span>}
                            </div>
                        </div>
                    )}
                    {lobby && (
                        <div style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(0,0,0,0.5)",
                            backdropFilter: "blur(4px)"
                        }}>
                            <div style={{
                                padding: "16px 32px",
                                background: "white",
                                borderRadius: "100px",
                                color: "#007bff",
                                fontWeight: "bold",
                                boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                                animation: "pulse 2s infinite"
                            }}>
                                {skippedMessage ? "Partner skipped, finding next..." : "Searching for Partner..."}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div style={{
                marginTop: "20px",
                width: "100%",
                display: "flex",
                justifyContent: "center",
                paddingBottom: "40px"
            }}>
                <button
                    onClick={handleNext}
                    style={{
                        padding: "16px 80px",
                        fontSize: "20px",
                        fontWeight: "800",
                        background: "linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: "100px",
                        cursor: "pointer",
                        boxShadow: "0 10px 20px rgba(0,210,255,0.3)",
                        transition: "all 0.3s ease",
                        letterSpacing: "1px"
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.05) translateY(-2px)"}
                    onMouseOut={(e) => e.currentTarget.style.transform = "scale(1) translateY(0)"}
                >
                    NEXT PARTNER
                </button>
            </div>

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 0.9; }
                    50% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(1); opacity: 0.9; }
                }
            `}</style>
        </div>
    );
};
