"use client";

import { useEffect, useRef } from "react";

interface JitsiMeetProps {
  roomName: string;
  displayName?: string;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

export default function JitsiMeet({ roomName, displayName = "Recruiter" }: JitsiMeetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;

    script.onload = () => {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return;

      apiRef.current = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName,
        parentNode: containerRef.current,
        userInfo: { displayName },
        width: "100%",
        height: "100%",
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableDeepLinking: true,
          prejoinPageEnabled: false,
          // Layout tile view (tutti centrati come Zoom)
          defaultRemoteDisplayName: "Candidato",
          startAudioOnly: false,
        },
        interfaceConfigOverwrite: {

          TOOLBAR_BUTTONS: [
            "microphone",
            "camera",
            "desktop",
            "tileview",
            "fullscreen",
            "hangup",
          ],
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          TOOLBAR_ALWAYS_VISIBLE: true,
          FILM_STRIP_MAX_HEIGHT: 120,
        },
      });
    };

    document.head.appendChild(script);

    return () => {
      apiRef.current?.dispose();
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [roomName]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: 0 }}
    />
  );
}