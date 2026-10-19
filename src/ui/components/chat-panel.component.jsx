import React from "react";
import { Box } from "ink";
import { AssistantMessage } from "./assistant-message.component.jsx";
import { GeneratingMessage } from "./generating-message.component.jsx";
import { SystemMessage } from "./system-message.component.jsx";
import { ToolMessage } from "./tool-message.component.jsx";
import { UserMessage } from "./user-message.component.jsx";
import { WelcomeLine } from "./welcome-line.component.jsx";
import { ShellMessage } from "./shell-message.component.jsx";
import { Spacer } from "./spacer.component.jsx";
import { IntentMessage } from "./intent-message.component.jsx";

export function ChatPanel({ lines, width, height }) {
  return (
    <Box flexDirection="column" height={height} width={width} flexShrink={0} overflow="hidden">
      {lines.map((line, index) => (
        <Box
          key={line.key ?? `${line.type}-${index}`}
          width={width}
          height={1}
          flexShrink={0}
          overflow="hidden"
        >
          {renderLine(line, width)}
        </Box>
      ))}
    </Box>
  );
}

function renderLine({ text, type, severity, isPadding, isHeading, pixels }, width) {
  if (type === "spacer" || type === "welcome-space") {
    return <Spacer />;
  }

  if (type.startsWith("welcome-")) {
    return <WelcomeLine text={text} type={type} pixels={pixels} width={width} />;
  }

  const messageType = type;

  if (type.startsWith("tool-")) {
    return <ToolMessage text={text} type={type} width={width} />;
  }

  if (messageType === "intent") return <IntentMessage text={text} width={width} />;

  if (messageType.startsWith("system")) {
    return (
      <SystemMessage
        text={text}
        severity={severity}
        isPadding={isPadding}
        isHeading={isHeading}
        width={width}
      />
    );
  }

  if (messageType === "shell") {
    return <ShellMessage text={text} severity={severity} width={width} />;
  }

  if (messageType === "user") {
    return <UserMessage text={text} isPadding={isPadding} width={width} />;
  }

  if (type === "generating") {
    return <GeneratingMessage text={text} />;
  }

  return <AssistantMessage text={text} type={messageType} width={width} />;
}
