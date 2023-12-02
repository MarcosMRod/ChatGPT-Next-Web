import { useEffect, useState } from "react";

import {
  CogIcon,
  GithubIcon,
  PlugIcon,
  PlusIcon,
  RocketIcon,
  VenetianMaskIcon,
  XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Link, useNavigate } from "react-router-dom";

import { Path, REPO_URL } from "../constant";
import Locale from "../locales";
import { useAppConfig, useChatStore } from "../store";
import { IconButton } from "./button";
import { showConfirm, showToast } from "./ui-lib";

const ChatList = dynamic(async () => (await import("./chat-list")).ChatList, {
  loading: () => null,
});

function useHotKey() {
  const chatStore = useChatStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey) {
        if (e.key === "ArrowUp") {
          chatStore.nextSession(-1);
        } else if (e.key === "ArrowDown") {
          chatStore.nextSession(1);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}

export function SideBar(props: { className?: string }) {
  const [url, setUrl] = useState<string>("");
  const [transcriptLoading, setTranscriptLoading] = useState<boolean>(false);
  const chatStore = useChatStore();

  const navigate = useNavigate();
  const config = useAppConfig();

  useHotKey();

  const getVideoTranscript = async () => {
    setTranscriptLoading(true);
    if (!url || url === "") {
      return;
    }
    const transcript = await fetch("/api/transcript", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
    const data = await transcript.json();
    navigator.clipboard.writeText(data);
    setTranscriptLoading(false);
  };
  const handleVideoUrlChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setUrl(e.target.value);
  };
  return (
    <div className="bg-zinc-800 text-white justify-between h-screen p-4 flex flex-col jutify-evenly">
      <div>
        <div data-tauri-drag-region className="flex flex-col gap-4 pt-8">
          <div
            data-tauri-drag-region
            className="flex items-center justify-center gap-2 text-3xl font-bold text-center"
          >
            <RocketIcon className="h-8 w-8" />
            AIBR
          </div>
          <p className="text-center italic bg-white/10">GPT test tool</p>
          <div>Build your own AI assistant.</div>
        </div>

        <div className="flex gap-2 items-center pt-8 justify-center">
          <IconButton
            icon={<VenetianMaskIcon className="text-white" />}
            text={Locale.Mask.Name}
            onClick={() => {
              if (config.dontShowMaskSplashScreen !== true) {
                navigate(Path.NewChat, { state: { fromHome: true } });
              } else {
                navigate(Path.Masks, { state: { fromHome: true } });
              }
            }}
            shadow
          />
          <IconButton
            icon={<PlugIcon className="h-6 w-4" />}
            text={Locale.Plugin.Name}
            onClick={() => showToast(Locale.WIP)}
            shadow
          />
        </div>

        <div
          className="mt-8 overflow-y-scroll max-h-64 border-y border-orange-400 rounded-lg w-full pl-2"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              navigate(Path.Home);
            }
          }}
        >
          <ChatList narrow={false} />
        </div>
      </div>
      <div className="w-full flex flex-col items-center gap-4">
        <input
          className="w-full rounded-full p-2 text-black"
          type="text"
          placeholder="video url..."
          value={url}
          onChange={handleVideoUrlChange}
        />
        <button
          className="p-2 outline outline-white rounded-full"
          onClick={getVideoTranscript}
          disabled={transcriptLoading}
        >
          {transcriptLoading ? "...loading" : "get transcript"}
        </button>
      </div>
      <div className="flex flex-col-reverse items-center">
        <div className="flex gap-2 p-2">
          <div>
            <IconButton
              icon={<XIcon className="h-6 w-4" />}
              onClick={async () => {
                if (await showConfirm(Locale.Home.DeleteChat)) {
                  chatStore.deleteSession(chatStore.currentSessionIndex);
                }
              }}
            />
          </div>
          <div>
            <Link to={Path.Settings}>
              <IconButton icon={<CogIcon className="h-6 w-4" />} shadow />
            </Link>
          </div>
          <div>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <IconButton icon={<GithubIcon className="h-6 w-4" />} shadow />
            </a>
          </div>
        </div>
        <div>
          <IconButton
            icon={<PlusIcon className="h-6 w-4" />}
            text={Locale.Home.NewChat}
            onClick={() => {
              if (config.dontShowMaskSplashScreen) {
                chatStore.newSession();
                navigate(Path.Chat);
              } else {
                navigate(Path.NewChat);
              }
            }}
            shadow
          />
        </div>
      </div>
    </div>
  );
}
