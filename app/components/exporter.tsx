import { useEffect, useMemo, useRef, useState } from "react";

import { toBlob, toPng } from "html-to-image";
import dynamic from "next/dynamic";
import NextImage from "next/image";

import { api } from "../client/api";
import { getClientConfig } from "../config/client";
import { EXPORT_MESSAGE_CLASS_NAME } from "../constant";
import BotIcon from "../icons/bot.png";
import ChatGptIcon from "../icons/chatgpt.png";
import CopyIcon from "../icons/copy.svg";
import DownloadIcon from "../icons/download.svg";
import ShareIcon from "../icons/share.svg";
import LoadingIcon from "../icons/three-dots.svg";
import Locale from "../locales";
/* eslint-disable @next/next/no-img-element */
import { ChatMessage, useAppConfig, useChatStore } from "../store";
import { DEFAULT_MASK_AVATAR } from "../store/mask";
import { copyToClipboard, downloadAs, useMobileScreen } from "../utils";
import { prettyObject } from "../utils/format";
import { IconButton } from "./button";
import { Avatar } from "./emoji";
import { MessageSelector, useMessageSelector } from "./message-selector";
import {
  List,
  ListItem,
  Modal,
  Select,
  showImageModal,
  showModal,
  showToast,
} from "./ui-lib";

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoadingIcon />,
});

export function ExportMessageModal(props: { onClose: () => void }) {
  return (
    <div className="modal-mask bg-black/90 absolute top-0 left-0 h-screen w-full flex items-center justify-center">
      <Modal
        title={Locale.Export.Title}
        onClose={props.onClose}
        footer={
          <div
            style={{
              width: "100%",
              textAlign: "center",
              fontSize: 14,
              opacity: 0.5,
            }}
          >
            {Locale.Exporter.Description.Title}
          </div>
        }
      >
        <div style={{ minHeight: "40vh" }}>
          <MessageExporter />
        </div>
      </Modal>
    </div>
  );
}

function useSteps(
  steps: Array<{
    name: string;
    value: string;
  }>,
) {
  const stepCount = steps.length;
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const nextStep = () =>
    setCurrentStepIndex((currentStepIndex + 1) % stepCount);
  const prevStep = () =>
    setCurrentStepIndex((currentStepIndex - 1 + stepCount) % stepCount);

  return {
    currentStepIndex,
    setCurrentStepIndex,
    nextStep,
    prevStep,
    currentStep: steps[currentStepIndex],
  };
}

function Steps<
  T extends {
    name: string;
    value: string;
  }[],
>(props: { steps: T; onStepChange?: (index: number) => void; index: number }) {
  const steps = props.steps;
  const stepCount = steps.length;

  return (
    <div>
      <div>
        <div
          style={{
            width: `${((props.index + 1) / stepCount) * 100}%`,
          }}
        ></div>
      </div>
      <div>
        {steps.map((step, i) => {
          return (
            <div
              key={i}
              onClick={() => {
                props.onStepChange?.(i);
              }}
              role="button"
            >
              <span>{i + 1}</span>
              <span>{step.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MessageExporter() {
  const steps = [
    {
      name: Locale.Export.Steps.Select,
      value: "select",
    },
    {
      name: Locale.Export.Steps.Preview,
      value: "preview",
    },
  ];
  const { currentStep, setCurrentStepIndex, currentStepIndex } =
    useSteps(steps);
  const formats = ["text", "image", "json"] as const;
  type ExportFormat = (typeof formats)[number];

  const [exportConfig, setExportConfig] = useState({
    format: "image" as ExportFormat,
    includeContext: true,
  });

  function updateExportConfig(updater: (config: typeof exportConfig) => void) {
    const config = { ...exportConfig };
    updater(config);
    setExportConfig(config);
  }

  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const { selection, updateSelection } = useMessageSelector();
  const selectedMessages = useMemo(() => {
    const ret: ChatMessage[] = [];
    if (exportConfig.includeContext) {
      ret.push(...session.mask.context);
    }
    ret.push(...session.messages.filter((m) => selection.has(m.id)));
    return ret;
  }, [
    exportConfig.includeContext,
    session.messages,
    session.mask.context,
    selection,
  ]);
  function preview() {
    if (exportConfig.format === "text") {
      return (
        <MarkdownPreviewer messages={selectedMessages} topic={session.topic} />
      );
    } else if (exportConfig.format === "json") {
      return (
        <JsonPreviewer messages={selectedMessages} topic={session.topic} />
      );
    } else {
      return (
        <ImagePreviewer messages={selectedMessages} topic={session.topic} />
      );
    }
  }
  return (
    <>
      <Steps
        steps={steps}
        index={currentStepIndex}
        onStepChange={setCurrentStepIndex}
      />
      <div style={currentStep.value !== "select" ? { display: "none" } : {}}>
        <List>
          <ListItem
            title={Locale.Export.Format.Title}
            subTitle={Locale.Export.Format.SubTitle}
          >
            <Select
              value={exportConfig.format}
              onChange={(e) =>
                updateExportConfig(
                  (config) =>
                    (config.format = e.currentTarget.value as ExportFormat),
                )
              }
            >
              {formats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </ListItem>
          <ListItem
            title={Locale.Export.IncludeContext.Title}
            subTitle={Locale.Export.IncludeContext.SubTitle}
          >
            <input
              type="checkbox"
              checked={exportConfig.includeContext}
              onChange={(e) => {
                updateExportConfig(
                  (config) => (config.includeContext = e.currentTarget.checked),
                );
              }}
            ></input>
          </ListItem>
        </List>
        <MessageSelector
          selection={selection}
          updateSelection={updateSelection}
          defaultSelectAll
        />
      </div>
      {currentStep.value === "preview" && <div>{preview()}</div>}
    </>
  );
}

export function RenderExport(props: {
  messages: ChatMessage[];
  onRender: (messages: ChatMessage[]) => void;
}) {
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!domRef.current) return;
    const dom = domRef.current;
    const messages = Array.from(
      dom.getElementsByClassName(EXPORT_MESSAGE_CLASS_NAME),
    );

    if (messages.length !== props.messages.length) {
      return;
    }

    const renderMsgs = messages.map((v, i) => {
      const [role, _] = v.id.split(":");
      return {
        id: i.toString(),
        role: role as any,
        content: role === "user" ? v.textContent ?? "" : v.innerHTML,
        date: "",
      };
    });

    props.onRender(renderMsgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={domRef}>
      {props.messages.map((m, i) => (
        <div
          key={i}
          id={`${m.role}:${i}`}
          className={EXPORT_MESSAGE_CLASS_NAME}
        >
          <Markdown content={m.content} defaultShow />
        </div>
      ))}
    </div>
  );
}

export function PreviewActions(props: {
  download: () => void;
  copy: () => void;
  showCopy?: boolean;
  messages?: ChatMessage[];
}) {
  const [loading, setLoading] = useState(false);
  const [shouldExport, setShouldExport] = useState(false);

  const onRenderMsgs = (msgs: ChatMessage[]) => {
    setShouldExport(false);

    api
      .share(msgs)
      .then((res) => {
        if (!res) return;
        showModal({
          title: Locale.Export.Share,
          children: [
            <input
              type="text"
              value={res}
              key="input"
              style={{
                width: "100%",
                maxWidth: "unset",
              }}
              readOnly
              onClick={(e) => e.currentTarget.select()}
            ></input>,
          ],
          actions: [
            <IconButton
              icon={<CopyIcon />}
              text={Locale.Chat.Actions.Copy}
              key="copy"
              onClick={() => copyToClipboard(res)}
            />,
          ],
        });
        setTimeout(() => {
          window.open(res, "_blank");
        }, 800);
      })
      .catch((e) => {
        console.error("[Share]", e);
        showToast(prettyObject(e));
      })
      .finally(() => setLoading(false));
  };

  const share = async () => {
    if (props.messages?.length) {
      setLoading(true);
      setShouldExport(true);
    }
  };

  return (
    <>
      <div>
        {props.showCopy && (
          <IconButton
            text={Locale.Export.Copy}
            bordered
            shadow
            icon={<CopyIcon />}
            onClick={props.copy}
          ></IconButton>
        )}
        <IconButton
          text={Locale.Export.Download}
          bordered
          shadow
          icon={<DownloadIcon />}
          onClick={props.download}
        ></IconButton>
        <IconButton
          text={Locale.Export.Share}
          bordered
          shadow
          icon={loading ? <LoadingIcon /> : <ShareIcon />}
          onClick={share}
        ></IconButton>
      </div>
      <div
        style={{
          position: "fixed",
          right: "200vw",
          pointerEvents: "none",
        }}
      >
        {shouldExport && (
          <RenderExport
            messages={props.messages ?? []}
            onRender={onRenderMsgs}
          />
        )}
      </div>
    </>
  );
}

function ExportAvatar(props: { avatar: string }) {
  if (props.avatar === DEFAULT_MASK_AVATAR) {
    return (
      <img
        src={BotIcon.src}
        width={30}
        height={30}
        alt="bot"
        className="user-avatar"
      />
    );
  }

  return <Avatar avatar={props.avatar} />;
}

export function ImagePreviewer(props: {
  messages: ChatMessage[];
  topic: string;
}) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const mask = session.mask;
  const config = useAppConfig();

  const previewRef = useRef<HTMLDivElement>(null);

  const copy = () => {
    showToast(Locale.Export.Image.Toast);
    const dom = previewRef.current;
    if (!dom) return;
    toBlob(dom).then((blob) => {
      if (!blob) return;
      try {
        navigator.clipboard
          .write([
            new ClipboardItem({
              "image/png": blob,
            }),
          ])
          .then(() => {
            showToast(Locale.Copy.Success);
            refreshPreview();
          });
      } catch (e) {
        console.error("[Copy Image] ", e);
        showToast(Locale.Copy.Failed);
      }
    });
  };

  const isMobile = useMobileScreen();

  const download = async () => {
    showToast(Locale.Export.Image.Toast);
    const dom = previewRef.current;
    if (!dom) return;

    const isApp = getClientConfig()?.isApp;

    try {
      const blob = await toPng(dom);
      if (!blob) return;

      if (isMobile || (isApp && window.__TAURI__)) {
        if (isApp && window.__TAURI__) {
          const result = await window.__TAURI__.dialog.save({
            defaultPath: `${props.topic}.png`,
            filters: [
              {
                name: "PNG Files",
                extensions: ["png"],
              },
              {
                name: "All Files",
                extensions: ["*"],
              },
            ],
          });

          if (result !== null) {
            const response = await fetch(blob);
            const buffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);
            await window.__TAURI__.fs.writeBinaryFile(result, uint8Array);
            showToast(Locale.Download.Success);
          } else {
            showToast(Locale.Download.Failed);
          }
        } else {
          showImageModal(blob);
        }
      } else {
        const link = document.createElement("a");
        link.download = `${props.topic}.png`;
        link.href = blob;
        link.click();
        refreshPreview();
      }
    } catch (error) {
      showToast(Locale.Download.Failed);
    }
  };

  const refreshPreview = () => {
    const dom = previewRef.current;
    if (dom) {
      dom.innerHTML = dom.innerHTML; // Refresh the content of the preview by resetting its HTML for fix a bug glitching
    }
  };

  return (
    <div>
      <PreviewActions
        copy={copy}
        download={download}
        showCopy={!isMobile}
        messages={props.messages}
      />
      <div ref={previewRef}>
        <div>
          <div>
            <NextImage
              src={ChatGptIcon.src}
              alt="logo"
              width={50}
              height={50}
            />
          </div>

          <div>
            <div>ChatGPT Next Web</div>
            <div>github.com/Yidadaa/ChatGPT-Next-Web</div>
            <div>
              <ExportAvatar avatar={config.avatar} />
              <span>&</span>
              <ExportAvatar avatar={mask.avatar} />
            </div>
          </div>
          <div>
            <div>
              {Locale.Exporter.Model}: {mask.modelConfig.model}
            </div>
            <div>
              {Locale.Exporter.Messages}: {props.messages.length}
            </div>
            <div>
              {Locale.Exporter.Topic}: {session.topic}
            </div>
            <div>
              {Locale.Exporter.Time}:{" "}
              {new Date(
                props.messages.at(-1)?.date ?? Date.now(),
              ).toLocaleString()}
            </div>
          </div>
        </div>
        {props.messages.map((m, i) => {
          return (
            <div key={i}>
              <div>
                <ExportAvatar
                  avatar={m.role === "user" ? config.avatar : mask.avatar}
                />
              </div>

              <div>
                <Markdown
                  content={m.content}
                  fontSize={config.fontSize}
                  defaultShow
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MarkdownPreviewer(props: {
  messages: ChatMessage[];
  topic: string;
}) {
  const mdText =
    `# ${props.topic}\n\n` +
    props.messages
      .map((m) => {
        return m.role === "user"
          ? `## ${Locale.Export.MessageFromYou}:\n${m.content}`
          : `## ${Locale.Export.MessageFromChatGPT}:\n${m.content.trim()}`;
      })
      .join("\n\n");

  const copy = () => {
    copyToClipboard(mdText);
  };
  const download = () => {
    downloadAs(mdText, `${props.topic}.md`);
  };
  return (
    <>
      <PreviewActions
        copy={copy}
        download={download}
        showCopy={true}
        messages={props.messages}
      />
      <div className="markdown-body">
        <pre>{mdText}</pre>
      </div>
    </>
  );
}

export function JsonPreviewer(props: {
  messages: ChatMessage[];
  topic: string;
}) {
  const msgs = {
    messages: [
      {
        role: "system",
        content: `${Locale.FineTuned.Sysmessage} ${props.topic}`,
      },
      ...props.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
  };
  const mdText = "```json\n" + JSON.stringify(msgs, null, 2) + "\n```";
  const minifiedJson = JSON.stringify(msgs);

  const copy = () => {
    copyToClipboard(minifiedJson);
  };
  const download = () => {
    downloadAs(JSON.stringify(msgs), `${props.topic}.json`);
  };

  return (
    <>
      <PreviewActions
        copy={copy}
        download={download}
        showCopy={false}
        messages={props.messages}
      />
      <div className="markdown-body" onClick={copy}>
        <Markdown content={mdText} />
      </div>
    </>
  );
}
