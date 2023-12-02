import { useEffect, useRef, useState } from "react";

import { useLocation, useNavigate } from "react-router-dom";

import { useCommand } from "../command";
import { Path, SlotID } from "../constant";
import EyeIcon from "../icons/eye.svg";
import LeftIcon from "../icons/left.svg";
import LightningIcon from "../icons/lightning.svg";
import Locale from "../locales";
import { BUILTIN_MASK_STORE } from "../masks";
import { useAppConfig, useChatStore } from "../store";
import { Mask, useMaskStore } from "../store/mask";
import { IconButton } from "./button";
import { EmojiAvatar } from "./emoji";
import { MaskAvatar } from "./mask";
import { showConfirm } from "./ui-lib";

function MaskItem(props: { mask: Mask; onClick?: () => void }) {
  return (
    <div onClick={props.onClick}>
      <MaskAvatar
        avatar={props.mask.avatar}
        model={props.mask.modelConfig.model}
      />
      <div>{props.mask.name}</div>
    </div>
  );
}

function useMaskGroup(masks: Mask[]) {
  const [groups, setGroups] = useState<Mask[][]>([]);

  useEffect(() => {
    const computeGroup = () => {
      const appBody = document.getElementById(SlotID.AppBody);
      if (!appBody || masks.length === 0) return;

      const rect = appBody.getBoundingClientRect();
      const maxWidth = rect.width;
      const maxHeight = rect.height * 0.6;
      const maskItemWidth = 120;
      const maskItemHeight = 50;

      const randomMask = () => masks[Math.floor(Math.random() * masks.length)];
      let maskIndex = 0;
      const nextMask = () => masks[maskIndex++ % masks.length];

      const rows = Math.ceil(maxHeight / maskItemHeight);
      const cols = Math.ceil(maxWidth / maskItemWidth);

      const newGroups = new Array(rows)
        .fill(0)
        .map((_, _i) =>
          new Array(cols)
            .fill(0)
            .map((_, j) => (j < 1 || j > cols - 2 ? randomMask() : nextMask())),
        );

      setGroups(newGroups);
    };

    computeGroup();

    window.addEventListener("resize", computeGroup);
    return () => window.removeEventListener("resize", computeGroup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return groups;
}

export function NewChat() {
  const chatStore = useChatStore();
  const maskStore = useMaskStore();

  const masks = maskStore.getAll();
  const groups = useMaskGroup(masks);

  const navigate = useNavigate();
  const config = useAppConfig();

  const maskRef = useRef<HTMLDivElement>(null);

  const { state } = useLocation();

  const startChat = (mask?: Mask) => {
    setTimeout(() => {
      chatStore.newSession(mask);
      navigate(Path.Chat);
    }, 10);
  };

  useCommand({
    mask: (id) => {
      try {
        const mask = maskStore.get(id) ?? BUILTIN_MASK_STORE.get(id);
        startChat(mask ?? undefined);
      } catch {
        console.error("[New Chat] failed to create chat from mask id=", id);
      }
    },
  });

  useEffect(() => {
    if (maskRef.current) {
      maskRef.current.scrollLeft =
        (maskRef.current.scrollWidth - maskRef.current.clientWidth) / 2;
    }
  }, [groups]);

  return (
    <div>
      <div>
        <IconButton
          icon={<LeftIcon />}
          text={Locale.NewChat.Return}
          onClick={() => navigate(Path.Home)}
        ></IconButton>
        {!state?.fromHome && (
          <IconButton
            text={Locale.NewChat.NotShow}
            onClick={async () => {
              if (await showConfirm(Locale.NewChat.ConfirmNoShow)) {
                startChat();
                config.update(
                  (config) => (config.dontShowMaskSplashScreen = true),
                );
              }
            }}
          ></IconButton>
        )}
      </div>
      <div>
        <div>
          <EmojiAvatar avatar="1f606" size={24} />
        </div>
        <div>
          <EmojiAvatar avatar="1f916" size={24} />
        </div>
        <div>
          <EmojiAvatar avatar="1f479" size={24} />
        </div>
      </div>

      <div>{Locale.NewChat.Title}</div>
      <div>{Locale.NewChat.SubTitle}</div>

      <div>
        <IconButton
          text={Locale.NewChat.More}
          onClick={() => navigate(Path.Masks)}
          icon={<EyeIcon />}
          bordered
          shadow
        />

        <IconButton
          text={Locale.NewChat.Skip}
          onClick={() => startChat()}
          icon={<LightningIcon />}
          type="primary"
          shadow
        />
      </div>

      <div ref={maskRef}>
        {groups.map((masks, i) => (
          <div key={i}>
            {masks.map((mask, index) => (
              <MaskItem
                key={index}
                mask={mask}
                onClick={() => startChat(mask)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
