import React, {
  ChangeEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BotIcon,
  BrainIcon,
  CheckIcon,
  CogIcon,
  CopyIcon,
  EditIcon,
  ListEndIcon,
  LoaderIcon,
  MaximizeIcon,
  MinimizeIcon,
  PanelBottomIcon,
  PinIcon,
  Redo2Icon,
  ReplyAllIcon,
  SendIcon,
  ShareIcon,
  StopCircleIcon,
  VenetianMaskIcon,
  XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useNavigate } from "react-router-dom";
import { get_encoding } from "tiktoken";
import { useDebouncedCallback } from "use-debounce";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { ChatControllerPool } from "../client/controller";
import { ChatCommandPrefix, useChatCommand, useCommand } from "../command";
import { getClientConfig } from "../config/client";
import {
  CHAT_PAGE_SIZE,
  LAST_INPUT_KEY,
  Path,
  REQUEST_TIMEOUT_MS,
  UNFINISHED_INPUT,
} from "../constant";
import Locale from "../locales";
import {
  BOT_HELLO,
  ChatMessage,
  createMessage,
  DEFAULT_TOPIC,
  ModelType,
  SubmitKey,
  Theme,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";
import { useMaskStore } from "../store/mask";
import { Prompt, usePromptStore } from "../store/prompt";
import { copyToClipboard, selectOrCopy } from "../utils";
import { prettyObject } from "../utils/format";
import { useAllModels } from "../utils/hooks";
import { IconButton } from "./button";
import { Avatar } from "./emoji";
import { ExportMessageModal } from "./exporter";
import { ContextPrompts, MaskAvatar, MaskConfig } from "./mask";
import {
  List,
  ListItem,
  Modal,
  Selector,
  showConfirm,
  showPrompt,
  showToast,
} from "./ui-lib";

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoaderIcon />,
});

export function SessionConfigModel(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const maskStore = useMaskStore();
  const navigate = useNavigate();

  return (
    <div className="bg-black/90 absolute top-0 left-0 h-screen w-full flex items-center justify-center">
      <Modal
        title={Locale.Context.Edit}
        onClose={() => props.onClose()}
        actions={[
          <IconButton
            key="reset"
            icon={<ReplyAllIcon />}
            bordered
            text={Locale.Chat.Config.Reset}
            onClick={async () => {
              if (await showConfirm(Locale.Memory.ResetConfirm)) {
                chatStore.updateCurrentSession(
                  (session) => (session.memoryPrompt = ""),
                );
              }
            }}
          />,
          <IconButton
            key="copy"
            icon={<CopyIcon />}
            bordered
            text={Locale.Chat.Config.SaveAs}
            onClick={() => {
              navigate(Path.Masks);
              setTimeout(() => {
                maskStore.create(session.mask);
              }, 500);
            }}
          />,
        ]}
      >
        <MaskConfig
          mask={session.mask}
          updateMask={(updater) => {
            const mask = { ...session.mask };
            updater(mask);
            chatStore.updateCurrentSession((session) => (session.mask = mask));
          }}
          shouldSyncFromGlobal
          extraListItems={
            session.mask.modelConfig.sendMemory ? (
              <ListItem
                className="copyable"
                title={`${Locale.Memory.Title} (${session.lastSummarizeIndex} of ${session.messages.length})`}
                subTitle={session.memoryPrompt || Locale.Memory.EmptyContent}
              ></ListItem>
            ) : (
              <></>
            )
          }
        ></MaskConfig>
      </Modal>
    </div>
  );
}

function PromptToast(props: {
  showToast?: boolean;
  showModal?: boolean;
  setShowModal: (_: boolean) => void;
}) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const context = session.mask.context;

  return (
    <div>
      {props.showToast && (
        <div role="button" onClick={() => props.setShowModal(true)}>
          <BrainIcon />
          <span>{Locale.Context.Toast(context.length)}</span>
        </div>
      )}
      {props.showModal && (
        <SessionConfigModel onClose={() => props.setShowModal(false)} />
      )}
    </div>
  );
}

function useSubmitHandler() {
  const config = useAppConfig();
  const submitKey = config.submitKey;
  const isComposing = useRef(false);

  useEffect(() => {
    const onCompositionStart = () => {
      isComposing.current = true;
    };
    const onCompositionEnd = () => {
      isComposing.current = false;
    };

    window.addEventListener("compositionstart", onCompositionStart);
    window.addEventListener("compositionend", onCompositionEnd);

    return () => {
      window.removeEventListener("compositionstart", onCompositionStart);
      window.removeEventListener("compositionend", onCompositionEnd);
    };
  }, []);

  const shouldSubmit = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return false;
    if (e.key === "Enter" && (e.nativeEvent.isComposing || isComposing.current))
      return false;
    return (
      (config.submitKey === SubmitKey.AltEnter && e.altKey) ||
      (config.submitKey === SubmitKey.CtrlEnter && e.ctrlKey) ||
      (config.submitKey === SubmitKey.ShiftEnter && e.shiftKey) ||
      (config.submitKey === SubmitKey.MetaEnter && e.metaKey) ||
      (config.submitKey === SubmitKey.Enter &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey)
    );
  };

  return {
    submitKey,
    shouldSubmit,
  };
}

export type RenderPompt = Pick<Prompt, "title" | "content">;

export function PromptHints(props: {
  prompts: RenderPompt[];
  onPromptSelect: (prompt: RenderPompt) => void;
}) {
  const noPrompts = props.prompts.length === 0;
  const [selectIndex, setSelectIndex] = useState(0);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectIndex(0);
  }, [props.prompts.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (noPrompts || e.metaKey || e.altKey || e.ctrlKey) {
        return;
      }
      // arrow up / down to select prompt
      const changeIndex = (delta: number) => {
        e.stopPropagation();
        e.preventDefault();
        const nextIndex = Math.max(
          0,
          Math.min(props.prompts.length - 1, selectIndex + delta),
        );
        setSelectIndex(nextIndex);
        selectedRef.current?.scrollIntoView({
          block: "center",
        });
      };

      if (e.key === "ArrowUp") {
        changeIndex(1);
      } else if (e.key === "ArrowDown") {
        changeIndex(-1);
      } else if (e.key === "Enter") {
        const selectedPrompt = props.prompts.at(selectIndex);
        if (selectedPrompt) {
          props.onPromptSelect(selectedPrompt);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prompts.length, selectIndex]);

  if (noPrompts) return null;
  return (
    <div>
      {props.prompts.map((prompt, i) => (
        <div
          className="bg-zinc-700 text-white"
          ref={i === selectIndex ? selectedRef : null}
          key={prompt.title + i.toString()}
          onClick={() => props.onPromptSelect(prompt)}
          onMouseEnter={() => setSelectIndex(i)}
        >
          <h3>{prompt.title}</h3>
          <p>{prompt.content}</p>
        </div>
      ))}
    </div>
  );
}

function ClearContextDivider() {
  const chatStore = useChatStore();

  return (
    <div
      onClick={() =>
        chatStore.updateCurrentSession(
          (session) => (session.clearContextIndex = undefined),
        )
      }
    >
      <div>{Locale.Context.Clear}</div>
      <div>{Locale.Context.Revert}</div>
    </div>
  );
}

function ChatAction({
  text,
  icon,
  onClick,
}: {
  text: string;
  icon: JSX.Element;
  onClick: () => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <button onClick={onClick}>{icon}</button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="hidden">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function useScrollToBottom() {
  // for auto-scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  function scrollDomToBottom() {
    const dom = scrollRef.current;
    if (dom) {
      requestAnimationFrame(() => {
        setAutoScroll(true);
        dom.scrollTo(0, dom.scrollHeight);
      });
    }
  }

  // auto scroll
  useEffect(() => {
    if (autoScroll) {
      scrollDomToBottom();
    }
  });

  return {
    scrollRef,
    autoScroll,
    setAutoScroll,
    scrollDomToBottom,
  };
}

export function ChatActions(props: {
  showPromptModal: () => void;
  scrollToBottom: () => void;
  showPromptHints: () => void;
  hitBottom: boolean;
}) {
  const config = useAppConfig();
  const navigate = useNavigate();
  const chatStore = useChatStore();

  // switch themes
  const theme = config.theme;
  function nextTheme() {
    const themes = [Theme.Auto, Theme.Light, Theme.Dark];
    const themeIndex = themes.indexOf(theme);
    const nextIndex = (themeIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    config.update((config) => (config.theme = nextTheme));
  }

  // stop all responses
  const couldStop = ChatControllerPool.hasPending();
  const stopAll = () => ChatControllerPool.stopAll();

  // switch model
  const currentModel = chatStore.currentSession().mask.modelConfig.model;
  const allModels = useAllModels();
  const models = useMemo(
    () => allModels.filter((m) => m.available),
    [allModels],
  );
  const [showModelSelector, setShowModelSelector] = useState(false);

  useEffect(() => {
    // if current model is not available
    // switch to first available model
    const isUnavaliableModel = !models.some((m) => m.name === currentModel);
    if (isUnavaliableModel && models.length > 0) {
      const nextModel = models[0].name as ModelType;
      chatStore.updateCurrentSession(
        (session) => (session.mask.modelConfig.model = nextModel),
      );
      showToast(nextModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModel, models]);

  return (
    <div className="flex gap-4 p-2">
      {couldStop && (
        <ChatAction
          onClick={stopAll}
          text={Locale.Chat.InputActions.Stop}
          icon={<StopCircleIcon />}
        />
      )}
      {!props.hitBottom && (
        <ChatAction
          onClick={props.scrollToBottom}
          text={Locale.Chat.InputActions.ToBottom}
          icon={<PanelBottomIcon />}
        />
      )}
      {props.hitBottom && (
        <ChatAction
          onClick={props.showPromptModal}
          text={Locale.Chat.InputActions.Settings}
          icon={<CogIcon />}
        />
      )}

      <ChatAction
        onClick={() => {
          navigate(Path.Masks);
        }}
        text={Locale.Chat.InputActions.Masks}
        icon={<VenetianMaskIcon />}
      />

      <ChatAction
        text={Locale.Chat.InputActions.Clear}
        icon={<ListEndIcon />}
        onClick={() => {
          chatStore.updateCurrentSession((session) => {
            if (session.clearContextIndex === session.messages.length) {
              session.clearContextIndex = undefined;
            } else {
              session.clearContextIndex = session.messages.length;
              session.memoryPrompt = ""; // will clear memory
            }
          });
        }}
      />

      <ChatAction
        onClick={() => setShowModelSelector(true)}
        text={currentModel}
        icon={<BotIcon />}
      />

      {showModelSelector && (
        <Selector
          defaultSelectedValue={currentModel}
          items={models.map((m) => ({
            title: m.displayName,
            value: m.name,
          }))}
          onClose={() => setShowModelSelector(false)}
          onSelection={(s) => {
            if (s.length === 0) return;
            chatStore.updateCurrentSession((session) => {
              session.mask.modelConfig.model = s[0] as ModelType;
              session.mask.syncGlobalConfig = false;
            });
            showToast(s[0]);
          }}
        />
      )}
    </div>
  );
}

export function EditMessageModal(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const [messages, setMessages] = useState(session.messages.slice());
  const [topic, setTopic] = useState(session.topic);

  return (
    <div className="w-full">
      <Modal
        title={Locale.Chat.EditMessage.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            text={Locale.UI.Cancel}
            icon={<XIcon />}
            key="cancel"
            onClick={() => {
              props.onClose();
            }}
          />,
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<CheckIcon />}
            key="ok"
            onClick={() => {
              chatStore.updateCurrentSession(
                (session) => (
                  (session.messages = messages), (session.topic = topic)
                ),
              );
              props.onClose();
            }}
          />,
        ]}
      >
        <List>
          <ListItem
            title={Locale.Chat.EditMessage.Topic.Title}
            subTitle={Locale.Chat.EditMessage.Topic.SubTitle}
          >
            <input
              type="text"
              className="bg-zinc-700 rounded-lg p-1"
              value={topic}
              onInput={(e) => setTopic(e.currentTarget.value)}
            />
          </ListItem>
        </List>
        <ContextPrompts
          context={messages}
          updateContext={(updater) => {
            const newMessages = messages.slice();
            updater(newMessages);
            setMessages(newMessages);
          }}
        />
      </Modal>
    </div>
  );
}

function _Chat() {
  type RenderMessage = ChatMessage & { preview?: boolean };

  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const config = useAppConfig();
  const fontSize = config.fontSize;

  const [showExport, setShowExport] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { submitKey, shouldSubmit } = useSubmitHandler();
  const { scrollRef, setAutoScroll, scrollDomToBottom } = useScrollToBottom();
  const [hitBottom, setHitBottom] = useState(true);
  const [tokensCount, setTokensCount] = useState(0);
  const navigate = useNavigate();

  // prompt hints
  const promptStore = usePromptStore();
  const [promptHints, setPromptHints] = useState<RenderPompt[]>([]);
  const onSearch = useDebouncedCallback(
    (text: string) => {
      const matchedPrompts = promptStore.search(text);
      setPromptHints(matchedPrompts);
    },
    100,
    { leading: true, trailing: true },
  );

  // auto grow input
  const [inputRows, setInputRows] = useState(2);

  // chat commands shortcuts
  const chatCommands = useChatCommand({
    new: () => chatStore.newSession(),
    newm: () => navigate(Path.NewChat),
    prev: () => chatStore.nextSession(-1),
    next: () => chatStore.nextSession(1),
    clear: () =>
      chatStore.updateCurrentSession(
        (session) => (session.clearContextIndex = session.messages.length),
      ),
    del: () => chatStore.deleteSession(chatStore.currentSessionIndex),
  });

  // only search prompts when user input is short
  const SEARCH_TEXT_LIMIT = 30;
  const onInput = (text: string) => {
    const tokens = get_encoding("cl100k_base").encode(text);
    setTokensCount(tokens.length);
    setUserInput(text);
    const n = text.trim().length;

    // clear search results
    if (n === 0) {
      setPromptHints([]);
    } else if (text.startsWith(ChatCommandPrefix)) {
      setPromptHints(chatCommands.search(text));
    } else if (!config.disablePromptHint && n < SEARCH_TEXT_LIMIT) {
      // check if need to trigger auto completion
      if (text.startsWith("/")) {
        let searchText = text.slice(1);
        onSearch(searchText);
      }
    }
  };

  const doSubmit = (userInput: string) => {
    if (userInput.trim() === "") return;
    const matchCommand = chatCommands.match(userInput);
    if (matchCommand.matched) {
      setUserInput("");
      setPromptHints([]);
      matchCommand.invoke();
      return;
    }
    setIsLoading(true);
    chatStore.onUserInput(userInput).then(() => setIsLoading(false));
    localStorage.setItem(LAST_INPUT_KEY, userInput);
    setUserInput("");
    setPromptHints([]);
    setAutoScroll(true);
  };

  const onPromptSelect = (prompt: RenderPompt) => {
    setTimeout(() => {
      setPromptHints([]);

      const matchedChatCommand = chatCommands.match(prompt.content);
      if (matchedChatCommand.matched) {
        // if user is selecting a chat command, just trigger it
        matchedChatCommand.invoke();
        setUserInput("");
      } else {
        // or fill the prompt
        setUserInput(prompt.content);
      }
      inputRef.current?.focus();
    }, 30);
  };

  // stop response
  const onUserStop = (messageId: string) => {
    ChatControllerPool.stop(session.id, messageId);
  };

  useEffect(() => {
    chatStore.updateCurrentSession((session) => {
      const stopTiming = Date.now() - REQUEST_TIMEOUT_MS;
      session.messages.forEach((m) => {
        // check if should stop all stale messages
        if (m.isError || new Date(m.date).getTime() < stopTiming) {
          if (m.streaming) {
            m.streaming = false;
          }

          if (m.content.length === 0) {
            m.isError = true;
            m.content = prettyObject({
              error: true,
              message: "empty response",
            });
          }
        }
      });

      // auto sync mask config from global config
      if (session.mask.syncGlobalConfig) {
        console.log("[Mask] syncing from global, name = ", session.mask.name);
        session.mask.modelConfig = { ...config.modelConfig };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // check if should send message
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // if ArrowUp and no userInput, fill with last input
    if (
      e.key === "ArrowUp" &&
      userInput.length <= 0 &&
      !(e.metaKey || e.altKey || e.ctrlKey)
    ) {
      setUserInput(localStorage.getItem(LAST_INPUT_KEY) ?? "");
      e.preventDefault();
      return;
    }
    if (shouldSubmit(e) && promptHints.length === 0) {
      doSubmit(userInput);
      e.preventDefault();
    }
  };
  const onRightClick = (e: any, message: ChatMessage) => {
    // copy to clipboard
    if (selectOrCopy(e.currentTarget, message.content)) {
      if (userInput.length === 0) {
        setUserInput(message.content);
      }

      e.preventDefault();
    }
  };

  const deleteMessage = (msgId?: string) => {
    chatStore.updateCurrentSession(
      (session) =>
        (session.messages = session.messages.filter((m) => m.id !== msgId)),
    );
  };

  const onDelete = (msgId: string) => {
    deleteMessage(msgId);
  };

  const onResend = (message: ChatMessage) => {
    // when it is resending a message
    // 1. for a user's message, find the next bot response
    // 2. for a bot's message, find the last user's input
    // 3. delete original user input and bot's message
    // 4. resend the user's input

    const resendingIndex = session.messages.findIndex(
      (m) => m.id === message.id,
    );

    if (resendingIndex < 0 || resendingIndex >= session.messages.length) {
      console.error("[Chat] failed to find resending message", message);
      return;
    }

    let userMessage: ChatMessage | undefined;
    let botMessage: ChatMessage | undefined;

    if (message.role === "assistant") {
      // if it is resending a bot's message, find the user input for it
      botMessage = message;
      for (let i = resendingIndex; i >= 0; i -= 1) {
        if (session.messages[i].role === "user") {
          userMessage = session.messages[i];
          break;
        }
      }
    } else if (message.role === "user") {
      // if it is resending a user's input, find the bot's response
      userMessage = message;
      for (let i = resendingIndex; i < session.messages.length; i += 1) {
        if (session.messages[i].role === "assistant") {
          botMessage = session.messages[i];
          break;
        }
      }
    }

    if (userMessage === undefined) {
      console.error("[Chat] failed to resend", message);
      return;
    }

    // delete the original messages
    deleteMessage(userMessage.id);
    deleteMessage(botMessage?.id);

    // resend the message
    setIsLoading(true);
    chatStore.onUserInput(userMessage.content).then(() => setIsLoading(false));
    inputRef.current?.focus();
  };

  const onPinMessage = (message: ChatMessage) => {
    chatStore.updateCurrentSession((session) =>
      session.mask.context.push(message),
    );

    showToast(Locale.Chat.Actions.PinToastContent, {
      text: Locale.Chat.Actions.PinToastAction,
      onClick: () => {
        setShowPromptModal(true);
      },
    });
  };

  const context: RenderMessage[] = useMemo(() => {
    return session.mask.hideContext ? [] : session.mask.context.slice();
  }, [session.mask.context, session.mask.hideContext]);
  const accessStore = useAccessStore();

  if (
    context.length === 0 &&
    session.messages.at(0)?.content !== BOT_HELLO.content
  ) {
    const copiedHello = Object.assign({}, BOT_HELLO);
    if (!accessStore.isAuthorized()) {
      copiedHello.content = Locale.Error.Unauthorized;
    }
    context.push(copiedHello);
  }

  // preview messages
  const renderMessages = useMemo(() => {
    return context
      .concat(session.messages as RenderMessage[])
      .concat(
        isLoading
          ? [
              {
                ...createMessage({
                  role: "assistant",
                  content: "……",
                }),
                preview: true,
              },
            ]
          : [],
      )
      .concat(
        userInput.length > 0 && config.sendPreviewBubble
          ? [
              {
                ...createMessage({
                  role: "user",
                  content: userInput,
                }),
                preview: true,
              },
            ]
          : [],
      );
  }, [
    config.sendPreviewBubble,
    context,
    isLoading,
    session.messages,
    userInput,
  ]);

  const [msgRenderIndex, _setMsgRenderIndex] = useState(
    Math.max(0, renderMessages.length - CHAT_PAGE_SIZE),
  );
  function setMsgRenderIndex(newIndex: number) {
    newIndex = Math.min(renderMessages.length - CHAT_PAGE_SIZE, newIndex);
    newIndex = Math.max(0, newIndex);
    _setMsgRenderIndex(newIndex);
  }

  const messages = useMemo(() => {
    const endRenderIndex = Math.min(
      msgRenderIndex + 3 * CHAT_PAGE_SIZE,
      renderMessages.length,
    );
    return renderMessages.slice(msgRenderIndex, endRenderIndex);
  }, [msgRenderIndex, renderMessages]);

  const onChatBodyScroll = (e: HTMLElement) => {
    const bottomHeight = e.scrollTop + e.clientHeight;
    const edgeThreshold = e.clientHeight;

    const isTouchTopEdge = e.scrollTop <= edgeThreshold;
    const isTouchBottomEdge = bottomHeight >= e.scrollHeight - edgeThreshold;
    const isHitBottom = bottomHeight >= e.scrollHeight - 10;

    const prevPageMsgIndex = msgRenderIndex - CHAT_PAGE_SIZE;
    const nextPageMsgIndex = msgRenderIndex + CHAT_PAGE_SIZE;

    if (isTouchTopEdge && !isTouchBottomEdge) {
      setMsgRenderIndex(prevPageMsgIndex);
    } else if (isTouchBottomEdge) {
      setMsgRenderIndex(nextPageMsgIndex);
    }

    setHitBottom(isHitBottom);
    setAutoScroll(isHitBottom);
  };

  function scrollToBottom() {
    setMsgRenderIndex(renderMessages.length - CHAT_PAGE_SIZE);
    scrollDomToBottom();
  }

  // clear context index = context length + index in messages
  const clearContextIndex =
    (session.clearContextIndex ?? -1) >= 0
      ? session.clearContextIndex! + context.length - msgRenderIndex
      : -1;

  const [showPromptModal, setShowPromptModal] = useState(false);

  const clientConfig = useMemo(() => getClientConfig(), []);

  const autoFocus = true;
  const showMaxIcon = !clientConfig?.isApp;
  useCommand({
    fill: setUserInput,
    submit: (text) => {
      doSubmit(text);
    },
    code: (text) => {
      if (accessStore.disableFastLink) return;
      console.log("[Command] got code from url: ", text);
      showConfirm(Locale.URLCommand.Code + `code = ${text}`).then((res) => {
        if (res) {
          accessStore.update((access) => (access.accessCode = text));
        }
      });
    },
    settings: (text) => {
      if (accessStore.disableFastLink) return;

      try {
        const payload = JSON.parse(text) as {
          key?: string;
          url?: string;
        };

        console.log("[Command] got settings from url: ", payload);

        if (payload.key || payload.url) {
          showConfirm(
            Locale.URLCommand.Settings +
              `\n${JSON.stringify(payload, null, 4)}`,
          ).then((res) => {
            if (!res) return;
            if (payload.key) {
              accessStore.update(
                (access) => (access.openaiApiKey = payload.key!),
              );
            }
            if (payload.url) {
              accessStore.update((access) => (access.openaiUrl = payload.url!));
            }
          });
        }
      } catch {
        console.error("[Command] failed to get settings from url: ", text);
      }
    },
  });
  const currentModel = chatStore.currentSession().mask.modelConfig.model;
  const currentPricing =
    currentModel.split("").splice(0, 5).join("") === "gpt-4"
      ? 0.01 / 1000
      : 0.001 / 1000;
  // edit / insert message modal
  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // remember unfinished input
  useEffect(() => {
    // try to load from local storage
    const key = UNFINISHED_INPUT(session.id);
    const mayBeUnfinishedInput = localStorage.getItem(key);
    if (mayBeUnfinishedInput && userInput.length === 0) {
      setUserInput(mayBeUnfinishedInput);
      localStorage.removeItem(key);
    }

    const dom = inputRef.current;
    return () => {
      localStorage.setItem(key, dom?.value ?? "");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      key={session.id}
      className="bg-zinc-900 text-white flex flex-col gap-8 overflow-y-scroll overflow-x-hidden p-8 relative max-h-screen w-full"
    >
      <div
        className="flex justify-between bg-white/20 p-4 rounded-xl w-full"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-4">
          <h3 onClickCapture={() => setIsEditingMessage(true)}>
            {!session.topic ? DEFAULT_TOPIC : session.topic}
          </h3>
          <p className="p-2 italic bg-zinc-800/20 text-white/60 rounded-xl">
            {Locale.Chat.SubTitle(session.messages.length)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="window-action-button">
            <IconButton
              icon={<EditIcon />}
              bordered
              onClick={() => setIsEditingMessage(true)}
            />
          </div>

          <div className="">
            <IconButton
              icon={<ShareIcon />}
              bordered
              title={Locale.Chat.Actions.Export}
              onClick={() => {
                setShowExport(true);
              }}
            />
          </div>
          {showMaxIcon && (
            <div className="window-action-button">
              <IconButton
                icon={config.tightBorder ? <MinimizeIcon /> : <MaximizeIcon />}
                bordered
                onClick={() => {
                  config.update(
                    (config) => (config.tightBorder = !config.tightBorder),
                  );
                }}
              />
            </div>
          )}
        </div>

        <PromptToast
          showToast={!hitBottom}
          showModal={showPromptModal}
          setShowModal={setShowPromptModal}
        />
      </div>

      <div
        className="flex flex-col gap-4 p-4 bg-white/20 rounded-xl overflow-y-scroll"
        ref={scrollRef}
        onScroll={(e) => onChatBodyScroll(e.currentTarget)}
        onMouseDown={() => inputRef.current?.blur()}
        onTouchStart={() => {
          inputRef.current?.blur();
          setAutoScroll(false);
        }}
      >
        {messages.map((message, i) => {
          const isUser = message.role === "user";
          const isContext = i < context.length;
          const showActions =
            i > 0 &&
            !(message.preview || message.content.length === 0) &&
            !isContext;
          const showTyping = message.preview || message.streaming;

          const shouldShowClearContextDivider = i === clearContextIndex - 1;
          const messageTokenCount = get_encoding("cl100k_base").encode(
            message.content,
          ).length;
          const messagePricing =
            message.model?.split("").splice(0, 5).join("") === "gpt-4"
              ? 0.01 / 1000
              : 0.001 / 1000;
          return (
            <Fragment key={message.id}>
              <div className="bg-zinc-600 p-2 rounded-xl flex flex-col gap-2">
                <div className="flex justify-between">
                  <div className="flex flex-row-reverse gap-2">
                    <IconButton
                      icon={<EditIcon className="h-4 w-4" />}
                      onClick={async () => {
                        const newMessage = await showPrompt(
                          Locale.Chat.Actions.Edit,
                          message.content,
                          10,
                        );
                        chatStore.updateCurrentSession((session) => {
                          const m = session.mask.context
                            .concat(session.messages)
                            .find((m) => m.id === message.id);
                          if (m) {
                            m.content = newMessage;
                          }
                        });
                      }}
                    ></IconButton>
                    {isUser ? (
                      <Avatar avatar={config.avatar} />
                    ) : (
                      <>
                        {["system"].includes(message.role) ? (
                          <Avatar avatar="2699-fe0f" />
                        ) : (
                          <MaskAvatar
                            avatar={session.mask.avatar}
                            model={
                              message.model || session.mask.modelConfig.model
                            }
                          />
                        )}
                      </>
                    )}
                  </div>

                  {showActions && (
                    <div className="flex gap-2 items-center">
                      {message.streaming ? (
                        <ChatAction
                          text={Locale.Chat.Actions.Stop}
                          icon={<StopCircleIcon />}
                          onClick={() => onUserStop(message.id ?? i)}
                        />
                      ) : (
                        <>
                          <ChatAction
                            text={Locale.Chat.Actions.Retry}
                            icon={<Redo2Icon />}
                            onClick={() => onResend(message)}
                          />

                          <ChatAction
                            text={Locale.Chat.Actions.Delete}
                            icon={<XIcon />}
                            onClick={() => onDelete(message.id ?? i)}
                          />

                          <ChatAction
                            text={Locale.Chat.Actions.Pin}
                            icon={<PinIcon />}
                            onClick={() => onPinMessage(message)}
                          />
                          <ChatAction
                            text={Locale.Chat.Actions.Copy}
                            icon={<CopyIcon />}
                            onClick={() => copyToClipboard(message.content)}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
                {showTyping && <div>{Locale.Chat.Typing}</div>}
                <div>
                  <Markdown
                    content={message.content}
                    loading={
                      (message.preview || message.streaming) &&
                      message.content.length === 0 &&
                      !isUser
                    }
                    onContextMenu={(e) => onRightClick(e, message)}
                    onDoubleClickCapture={() => {
                      setUserInput(message.content);
                    }}
                    fontSize={fontSize}
                    parentRef={scrollRef}
                    defaultShow={i >= messages.length - 6}
                  />
                </div>

                <div className="text-white/50 italic">
                  {isContext
                    ? Locale.Chat.IsContext
                    : message.date.toLocaleString()}{" "}
                  |{" "}
                  <span>
                    tokens: {messageTokenCount} - Price:{" "}
                    {(messageTokenCount * messagePricing).toFixed(6)}
                  </span>
                </div>
              </div>
              {shouldShowClearContextDivider && <ClearContextDivider />}
            </Fragment>
          );
        })}
      </div>

      <div className="flex bg-white/20 rounded-xl p-2 flex-col">
        <PromptHints prompts={promptHints} onPromptSelect={onPromptSelect} />
        <div className="flex gap-2 items-center">
          <ChatActions
            showPromptModal={() => setShowPromptModal(true)}
            scrollToBottom={scrollToBottom}
            hitBottom={hitBottom}
            showPromptHints={() => {
              // Click again to close
              if (promptHints.length > 0) {
                setPromptHints([]);
                return;
              }

              inputRef.current?.focus();
              setUserInput("/");
              onSearch("");
            }}
          />
          <div className="p-2 outline outline-white rounded-full m-2 flex items-center gap-2">
            <span className="text-sm text-white/50 italic">
              Input price est.:
              <span className="text-yellow-500">
                $ {(tokensCount * currentPricing).toFixed(6)}
              </span>
            </span>
            <span
              className={`text-sm ${
                tokensCount > 3000 ? "text-red-600" : "text-green-500"
              }`}
            >
              {tokensCount} tokens {tokensCount > 3000 && "(3000 is the limit)"}
            </span>
            <span className="text-sm text-white/50 italic">
              {currentModel.split("").splice(0, 5).join("")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <textarea
            className="bg-zinc-900 text-white w-full p-4 rounded-xl"
            ref={inputRef}
            placeholder={Locale.Chat.Input(submitKey)}
            onInput={(e: ChangeEvent<HTMLTextAreaElement>) =>
              onInput(e.target.value)
            }
            value={userInput}
            onKeyDown={onInputKeyDown}
            onFocus={scrollToBottom}
            onClick={scrollToBottom}
            rows={inputRows}
            autoFocus={autoFocus}
            style={{
              fontSize: config.fontSize,
            }}
          />
          <IconButton
            icon={<SendIcon />}
            text={Locale.Chat.Send}
            type="primary"
            onClick={() => doSubmit(userInput)}
          />
        </div>
      </div>

      {showExport && (
        <ExportMessageModal onClose={() => setShowExport(false)} />
      )}

      {isEditingMessage && (
        <EditMessageModal
          onClose={() => {
            setIsEditingMessage(false);
          }}
        />
      )}
    </div>
  );
}

export function Chat() {
  const chatStore = useChatStore();
  const sessionIndex = chatStore.currentSessionIndex;
  return <_Chat key={sessionIndex}></_Chat>;
}
