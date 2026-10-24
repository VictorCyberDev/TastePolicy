"use client";
import { Component, type ReactNode } from "react";

// A failure inside one optional section must never take the whole account page
// (and the signed-in state the person is working in) down with it.
export default class SectionBoundary extends Component<
  { children: ReactNode; label: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="status">{this.props.label} is unavailable right now.</p>
    ) : (
      this.props.children
    );
  }
}
