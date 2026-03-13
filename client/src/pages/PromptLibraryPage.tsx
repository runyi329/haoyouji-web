/**
 * PromptLibraryPage.tsx - 路由包装，从URL中提取 ledgerId 传给 PromptLibrary
 */
import { useRoute } from "wouter";
import PromptLibrary from "./PromptLibrary";

export default function PromptLibraryPage() {
  const [, params] = useRoute("/ledger/:id/prompt-library");
  const ledgerId = parseInt(params?.id || "0");
  return <PromptLibrary ledgerId={ledgerId} />;
}
