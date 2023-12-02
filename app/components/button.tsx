import * as React from "react";

export type ButtonType = "primary" | "danger" | null;

export function IconButton(props: {
  onClick?: () => void;
  icon?: JSX.Element;
  type?: ButtonType;
  text?: string;
  bordered?: boolean;
  shadow?: boolean;
  className?: string;
  title?: string;
  disabled?: boolean;
  tabIndex?: number;
  autoFocus?: boolean;
}) {
  return (
    <button
      className="flex p-2 bg-orange-400 text-white rounded-xl items-center justify-center shadow-[2px_2px_8px_2px_rgba(0,0,0,.2)]"
      onClick={props.onClick}
      title={props.title}
      disabled={props.disabled}
      role="button"
      tabIndex={props.tabIndex}
      autoFocus={props.autoFocus}
    >
      {props.icon && <div>{props.icon}</div>}

      {props.text && <div>{props.text}</div>}
    </button>
  );
}
