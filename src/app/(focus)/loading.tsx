import { LoadingScreen, SESSION_MESSAGES } from "@/components/states/Loading";

/** The focus shell has no navigation, so the full branded loader fits here. */
export default function Loading() {
  return <LoadingScreen messages={SESSION_MESSAGES} label="Loading your practice session" />;
}
