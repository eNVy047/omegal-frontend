import { useEffect, useRef, useState } from "react"
import { Room } from "./Room";

export const Landing = () => {
    const [name, setName] = useState("");
    const [gender, setGender] = useState("Other");
    const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null);
    const [localVideoTrack, setlocalVideoTrack] = useState<MediaStreamTrack | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const [joined, setJoined] = useState(false);

    const getCam = async () => {
        try {
            const stream = await window.navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            })
            const audioTrack = stream.getAudioTracks()[0]
            const videoTrack = stream.getVideoTracks()[0]
            setLocalAudioTrack(audioTrack);
            setlocalVideoTrack(videoTrack);
            if (videoRef.current) {
                videoRef.current.srcObject = new MediaStream([videoTrack])
                videoRef.current.play().catch(e => console.error(e));
            }
        } catch (e) {
            console.error("Error accessing media devices:", e);
        }
    }

    useEffect(() => {
        getCam();
        return () => {
            // Cleanup: stop tracks when unmounting or joining
            localAudioTrack?.stop();
            localVideoTrack?.stop();
        };
    }, []);

    if (!joined) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundImage: `
      linear-gradient(135deg, rgba(0,0,0,0.5), rgba(0,0,0,0.5)),
      url("https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/147C0/production/_132740938_indeximage.jpg")
    `,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundAttachment: "fixed",
                    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                    padding: "20px",
                }}
            >

                <div style={{
                    background: "rgba(255, 255, 255, 0.1)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "24px",
                    padding: "40px",
                    boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
                    border: "1px solid rgba(255, 255, 255, 0.18)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "24px",
                    maxWidth: "500px",
                    width: "100%"
                }}>
                    <h1 style={{ color: "white", margin: 0, fontSize: "2.5rem", fontWeight: "800", letterSpacing: "-1px" }}>Omegle Clone</h1>

                    <div style={{
                        width: "100%",
                        aspectRatio: "4/3",
                        borderRadius: "16px",
                        overflow: "hidden",
                        background: "#000",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                    }}>
                        <video autoPlay muted playsInline ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>

                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
                        <input
                            type="text"
                            placeholder="Enter your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={{
                                padding: "14px 20px",
                                borderRadius: "12px",
                                border: "none",
                                background: "rgba(255,255,255,0.9)",
                                fontSize: "16px",
                                outline: "none",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                            }}
                        />
                        <select
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                            style={{
                                padding: "14px 20px",
                                borderRadius: "12px",
                                border: "none",
                                background: "rgba(255,255,255,0.9)",
                                fontSize: "16px",
                                outline: "none",
                                cursor: "pointer",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                            }}
                        >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setJoined(true)}
                        disabled={!name.trim()}
                        style={{
                            width: "100%",
                            padding: "16px",
                            borderRadius: "12px",
                            border: "none",
                            background: name.trim() ? "linear-gradient(to right, #00d2ff, #3a7bd5)" : "#ccc",
                            color: "white",
                            fontSize: "18px",
                            fontWeight: "bold",
                            cursor: name.trim() ? "pointer" : "not-allowed",
                            transition: "transform 0.2s, box-shadow 0.2s",
                            boxShadow: name.trim() ? "0 4px 15px rgba(0,210,255,0.4)" : "none"
                        }}
                        onMouseOver={(e) => name.trim() && (e.currentTarget.style.transform = "translateY(-2px)")}
                        onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                    >
                        Start Chatting
                    </button>

                    <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", textAlign: "center", margin: 0 }}>
                        By joining, you agree to follow our community guidelines.
                    </p>
                </div>
            </div>
        )
    }

    return <Room name={name} gender={gender} localAudioTrack={localAudioTrack} localVideoTrack={localVideoTrack} />
}