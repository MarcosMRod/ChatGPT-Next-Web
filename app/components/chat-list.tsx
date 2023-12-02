import { XIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Path } from "../constant";
import Locale from "../locales";
import { useChatStore } from "../store";
import { Mask } from "../store/mask";
import { useMobileScreen } from "../utils";
import { MaskAvatar } from "./mask";
import { showConfirm } from "./ui-lib";

export function ChatItem(props: {
  onClick?: () => void;
  onDelete?: () => void;
  title: string;
  count: number;
  time: string;
  selected: boolean;
  id: string;
  index: number;
  narrow?: boolean;
  mask: Mask;
}) {
  return (
    <div
      className="flex  gap-2 p-2 bg-zinc-700 text-white rounded-xl w-full"
      onClick={props.onClick}
      title={`${props.title}\n${Locale.ChatItem.ChatItemCount(props.count)}`}
    >
      <div className="flex flex-col gap-2">
        {props.narrow ? (
          <div>
            <div>
              <MaskAvatar
                avatar={props.mask.avatar}
                model={props.mask.modelConfig.model}
              />
            </div>
            <div>{props.count}</div>
          </div>
        ) : (
          <>
            <div className="text-xs">{props.title}</div>
            <div>
              <div className="text-xs text-white/50 italic">
                {Locale.ChatItem.ChatItemCount(props.count)}
              </div>
              <div className="text-xs text-white/50">{props.time}</div>
            </div>
          </>
        )}
      </div>
      <div
        className="h-full justify-center flex"
        onClickCapture={(e) => {
          props.onDelete?.();
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <XIcon className="text-white h-4 w-4" />
      </div>
    </div>
  );
}

export function ChatList(props: { narrow?: boolean }) {
  const [sessions, selectedIndex, selectSession, moveSession] = useChatStore(
    (state) => [
      state.sessions,
      state.currentSessionIndex,
      state.selectSession,
      state.moveSession,
    ],
  );
  const chatStore = useChatStore();
  const navigate = useNavigate();
  const isMobileScreen = useMobileScreen();

  return (
    <>
      <div className="flex flex-col items-center gap-2 w-full">
        {sessions.map((item, i) => (
          <ChatItem
            title={item.topic}
            time={new Date(item.lastUpdate).toLocaleString()}
            count={item.messages.length}
            key={item.id}
            id={item.id}
            index={i}
            selected={i === selectedIndex}
            onClick={() => {
              navigate(Path.Chat);
              selectSession(i);
            }}
            onDelete={async () => {
              if (
                (!props.narrow && !isMobileScreen) ||
                (await showConfirm(Locale.Home.DeleteChat))
              ) {
                chatStore.deleteSession(i);
              }
            }}
            narrow={props.narrow}
            mask={item.mask}
          />
        ))}
      </div>
    </>
  );
}
