/* eslint-disable @next/next/no-img-element */

import React, { HTMLProps, useEffect, useState } from "react";

import { MaximizeIcon, MinimizeIcon, XIcon } from "lucide-react";
import { createRoot } from "react-dom/client";

import CancelIcon from "../icons/cancel.svg";
import ConfirmIcon from "../icons/confirm.svg";
import DownIcon from "../icons/down.svg";
import EyeOffIcon from "../icons/eye-off.svg";
import EyeIcon from "../icons/eye.svg";
import LoadingIcon from "../icons/three-dots.svg";
import Locale from "../locales";
import { IconButton } from "./button";

export function Popover(props: {
  children: JSX.Element;
  content: JSX.Element;
  open?: boolean;
  onClose?: () => void;
}) {
  return (
    <div>
      {props.children}
      {props.open && (
        <div>
          <div onClick={props.onClose}></div>
          {props.content}
        </div>
      )}
    </div>
  );
}

export function Card(props: { children: JSX.Element[]; className?: string }) {
  return <div>{props.children}</div>;
}

export function ListItem(props: {
  title: string;
  subTitle?: string;
  children?: JSX.Element | JSX.Element[];
  icon?: JSX.Element;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div onClick={props.onClick}>
      <div>
        {props.icon && <div>{props.icon}</div>}
        <div>
          <div>{props.title}</div>
          {props.subTitle && <div>{props.subTitle}</div>}
        </div>
      </div>
      {props.children}
    </div>
  );
}

export function List(props: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div id={props.id} className={props.className}>
      {props.children}
    </div>
  );
}

export function Loading() {
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LoadingIcon />
    </div>
  );
}

interface ModalProps {
  title: string;
  children?: any;
  actions?: React.ReactNode[];
  defaultMax?: boolean;
  footer?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}
export function Modal(props: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isMax, setMax] = useState(!!props.defaultMax);

  return (
    <div className="flex flex-col items-center bg-zinc-600 rounded-xl py-2">
      <div className={`flex-col flex  items-center p-4 w-full`}>
        <div className="flex justify-between w-full py-2">
          <h4 className="text-white">{props.title}</h4>

          <div className="flex gap-4">
            <div onClick={() => setMax(!isMax)}>
              {isMax ? (
                <MinimizeIcon className="text-white" />
              ) : (
                <MaximizeIcon className="text-white" />
              )}
            </div>
            <div onClick={props.onClose}>
              <XIcon className="text-white" />
            </div>
          </div>
        </div>

        <div className="flex flex-col overflow-y-scroll max-h-[500px] outline outline-white w-full p-8 rounded-xl">
          {props.children}
        </div>
      </div>

      <div>
        {props.footer}
        <div className="flex justify-center gap-4">
          {props.actions?.map((action, i) => <div key={i}>{action}</div>)}
        </div>
      </div>
    </div>
  );
}

export function showModal(props: ModalProps) {
  const div = document.createElement("div");
  div.className = "modal-mask";
  document.body.appendChild(div);

  const root = createRoot(div);
  const closeModal = () => {
    props.onClose?.();
    root.unmount();
    div.remove();
  };

  div.onclick = (e) => {
    if (e.target === div) {
      closeModal();
    }
  };

  root.render(<Modal {...props} onClose={closeModal}></Modal>);
}

export type ToastProps = {
  content: string;
  action?: {
    text: string;
    onClick: () => void;
  };
  onClose?: () => void;
};

export function Toast(props: ToastProps) {
  return (
    <div>
      <div>
        <span>{props.content}</span>
        {props.action && (
          <button
            onClick={() => {
              props.action?.onClick?.();
              props.onClose?.();
            }}
          >
            {props.action.text}
          </button>
        )}
      </div>
    </div>
  );
}

export function showToast(
  content: string,
  action?: ToastProps["action"],
  delay = 3000,
) {
  const div = document.createElement("div");

  document.body.appendChild(div);

  const root = createRoot(div);
  const close = () => {
    setTimeout(() => {
      root.unmount();
      div.remove();
    }, 300);
  };

  setTimeout(() => {
    close();
  }, delay);

  root.render(<Toast content={content} action={action} onClose={close} />);
}

export type InputProps = React.HTMLProps<HTMLTextAreaElement> & {
  autoHeight?: boolean;
  rows?: number;
};

export function Input(props: InputProps) {
  return <textarea {...props}></textarea>;
}

export function PasswordInput(props: HTMLProps<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  function changeVisibility() {
    setVisible(!visible);
  }

  return (
    <div className={"password-input-container"}>
      <IconButton
        icon={visible ? <EyeIcon /> : <EyeOffIcon />}
        onClick={changeVisibility}
        className={"password-eye"}
      />
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={"password-input"}
      />
    </div>
  );
}

export function Select(
  props: React.DetailedHTMLProps<
    React.SelectHTMLAttributes<HTMLSelectElement>,
    HTMLSelectElement
  >,
) {
  const { className, children, ...otherProps } = props;
  return (
    <div>
      <select {...otherProps}>{children}</select>
      <DownIcon />
    </div>
  );
}

export function showConfirm(content: any) {
  const div = document.createElement("div");
  div.className = "modal-mask";
  document.body.appendChild(div);

  const root = createRoot(div);
  const closeModal = () => {
    root.unmount();
    div.remove();
  };

  return new Promise<boolean>((resolve) => {
    root.render(
      <Modal
        title={Locale.UI.Confirm}
        actions={[
          <IconButton
            key="cancel"
            text={Locale.UI.Cancel}
            onClick={() => {
              resolve(false);
              closeModal();
            }}
            icon={<CancelIcon />}
            tabIndex={0}
            bordered
            shadow
          ></IconButton>,
          <IconButton
            key="confirm"
            text={Locale.UI.Confirm}
            type="primary"
            onClick={() => {
              resolve(true);
              closeModal();
            }}
            icon={<ConfirmIcon />}
            tabIndex={0}
            autoFocus
            bordered
            shadow
          ></IconButton>,
        ]}
        onClose={closeModal}
      >
        {content}
      </Modal>,
    );
  });
}

function PromptInput(props: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const [input, setInput] = useState(props.value);
  const onInput = (value: string) => {
    props.onChange(value);
    setInput(value);
  };

  return (
    <textarea
      autoFocus
      value={input}
      onInput={(e) => onInput(e.currentTarget.value)}
      rows={props.rows ?? 3}
    ></textarea>
  );
}

export function showPrompt(content: any, value = "", rows = 3) {
  const div = document.createElement("div");
  div.className = "modal-mask";
  document.body.appendChild(div);

  const root = createRoot(div);
  const closeModal = () => {
    root.unmount();
    div.remove();
  };

  return new Promise<string>((resolve) => {
    let userInput = value;

    root.render(
      <Modal
        title={content}
        actions={[
          <IconButton
            key="cancel"
            text={Locale.UI.Cancel}
            onClick={() => {
              closeModal();
            }}
            icon={<CancelIcon />}
            bordered
            shadow
            tabIndex={0}
          ></IconButton>,
          <IconButton
            key="confirm"
            text={Locale.UI.Confirm}
            type="primary"
            onClick={() => {
              resolve(userInput);
              closeModal();
            }}
            icon={<ConfirmIcon />}
            bordered
            shadow
            tabIndex={0}
          ></IconButton>,
        ]}
        onClose={closeModal}
      >
        <PromptInput
          onChange={(val) => (userInput = val)}
          value={value}
          rows={rows}
        ></PromptInput>
      </Modal>,
    );
  });
}

export function showImageModal(img: string) {
  showModal({
    title: Locale.Export.Image.Modal,
    children: (
      <div>
        <img
          src={img}
          alt="preview"
          style={{
            maxWidth: "100%",
          }}
        ></img>
      </div>
    ),
  });
}

export function Selector<T>(props: {
  items: Array<{
    title: string;
    subTitle?: string;
    value: T;
  }>;
  defaultSelectedValue?: T;
  onSelection?: (selection: T[]) => void;
  onClose?: () => void;
  multiple?: boolean;
}) {
  return (
    <div onClick={() => props.onClose?.()}>
      <div>
        <List>
          {props.items.map((item, i) => {
            const selected = props.defaultSelectedValue === item.value;
            return (
              <ListItem
                key={i}
                title={item.title}
                subTitle={item.subTitle}
                onClick={() => {
                  props.onSelection?.([item.value]);
                  props.onClose?.();
                }}
              >
                {selected ? (
                  <div
                    style={{
                      height: 10,
                      width: 10,
                      backgroundColor: "var(--primary)",
                      borderRadius: 10,
                    }}
                  ></div>
                ) : (
                  <></>
                )}
              </ListItem>
            );
          })}
        </List>
      </div>
    </div>
  );
}
