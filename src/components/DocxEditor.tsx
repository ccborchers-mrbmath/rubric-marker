import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export function DocxEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [tab, setTab] = useState<"preview" | "edit">("preview");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "preview" | "edit")}>
      <TabsList className="mb-2">
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="edit">Edit markdown</TabsTrigger>
      </TabsList>

      <TabsContent value="preview" className="mt-0">
        <div className="flex justify-center overflow-auto rounded-md bg-muted/40 p-4 sm:p-6">
          <div
            className="docx-page w-full max-w-[8.5in] bg-white px-[1in] py-[1in] text-[#1a1a1a] shadow-md ring-1 ring-black/5"
            style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif", fontSize: "11pt", lineHeight: 1.5 }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: (p) => <h1 className="mb-3 mt-2 border-b border-[#2e74b5]/30 pb-1 text-[26pt] font-semibold text-[#2e74b5]" {...p} />,
                h2: (p) => <h2 className="mb-2 mt-5 text-[18pt] font-semibold text-[#2e74b5]" {...p} />,
                h3: (p) => <h3 className="mb-1 mt-4 text-[13pt] font-semibold text-[#1f4e79]" {...p} />,
                h4: (p) => <h4 className="mb-1 mt-3 text-[11pt] font-semibold italic text-[#1f4e79]" {...p} />,
                p: (p) => <p className="my-2" {...p} />,
                ul: (p) => <ul className="my-2 list-disc pl-6" {...p} />,
                ol: (p) => <ol className="my-2 list-decimal pl-6" {...p} />,
                li: (p) => <li className="my-1" {...p} />,
                strong: (p) => <strong className="font-semibold" {...p} />,
                em: (p) => <em className="italic" {...p} />,
                blockquote: (p) => <blockquote className="my-3 border-l-4 border-[#2e74b5]/40 pl-4 italic text-[#444]" {...p} />,
                hr: () => <hr className="my-4 border-t border-[#d0d7de]" />,
                table: (p) => <table className="my-3 w-full border-collapse text-[10pt]" {...p} />,
                th: (p) => <th className="border border-[#bfbfbf] bg-[#f2f2f2] px-2 py-1 text-left font-semibold" {...p} />,
                td: (p) => <td className="border border-[#bfbfbf] px-2 py-1 align-top" {...p} />,
                code: (p) => <code className="rounded bg-[#f3f3f3] px-1 py-0.5 font-mono text-[10pt]" {...p} />,
              }}
            >
              {value || "_No content yet._"}
            </ReactMarkdown>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="edit" className="mt-0">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={22}
          className="font-mono text-sm"
        />
      </TabsContent>
    </Tabs>
  );
}
