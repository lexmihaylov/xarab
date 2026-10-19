import React from "react";
import { Text } from "ink";
import Spinner from "ink-spinner";

export function GeneratingMessage({ text }) {
  return (
    <Text color="#a8d5a2">
      <Spinner type="dots" /> {text}
    </Text>
  );
}
