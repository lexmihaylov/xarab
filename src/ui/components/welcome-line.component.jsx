import React from "react";
import { Box, Text } from "ink";

export function WelcomeLine({ text, type, width, pixels }) {
  const color =
    type === "welcome-logo" || type === "welcome-brand"
      ? "#8fbfdc"
      : type === "welcome-heading"
        ? "#a8d5a2"
        : type === "welcome-hint"
          ? "#657383"
          : "#c5d0dd";

  return (
    <Box width={width} justifyContent="center">
      <Text
        color={color}
        bold={
          !pixels &&
          (type === "welcome-logo" || type === "welcome-brand" || type === "welcome-heading")
        }
        wrap="truncate"
      >
        {pixels
          ? pixels.map((pixel, index) => (
              <Text key={index} color={pixel.color} backgroundColor={pixel.backgroundColor}>
                {pixel.text}
              </Text>
            ))
          : text}
      </Text>
    </Box>
  );
}
