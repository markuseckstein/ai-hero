import { SearchIcon, LinkIcon } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import type { OurMessageAnnotation } from "~/types";

const getStepTitle = (annotation: OurMessageAnnotation): string => {
  switch (annotation.type) {
    case "NEW_ACTION":
      return annotation.action.title;
    case "PLAN":
      return "Research Plan";
    case "SOURCES":
      return "Search Results";
    default:
      return "Unknown Step";
  }
};

export const ReasoningSteps = ({
  annotations,
}: {
  annotations: OurMessageAnnotation[];
}) => {
  const [openStep, setOpenStep] = useState<number | null>(null);

  if (annotations.length === 0) return null;

  return (
    <div className="mb-4 w-full">
      <ul className="space-y-1">
        {annotations.map((annotation, index) => {
          const isOpen = openStep === index;
          return (
            <li key={index} className="relative">
              <button
                onClick={() => setOpenStep(isOpen ? null : index)}
                className={`min-w-34 flex w-full flex-shrink-0 items-center rounded px-2 py-1 text-left text-sm transition-colors ${
                  isOpen
                    ? "bg-gray-700 text-gray-200"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                }`}
              >
                <span
                  className={`z-10 mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-500 text-xs font-bold ${
                    isOpen
                      ? "border-blue-400 text-white"
                      : "bg-gray-800 text-gray-300"
                  }`}
                >
                  {index + 1}
                </span>
                {getStepTitle(annotation)}
              </button>
              <div className={`${isOpen ? "mt-1" : "hidden"}`}>
                {isOpen && (
                  <div className="px-2 py-1">
                    {annotation.type === "NEW_ACTION" && (
                      <>
                        <div className="text-sm italic text-gray-400">
                          <Markdown>{annotation.action.reasoning}</Markdown>
                        </div>
                        {annotation.action.type === "continue" &&
                          annotation.action.feedback && (
                            <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                              <SearchIcon className="size-4" />
                              <Markdown>{annotation.action.feedback}</Markdown>
                            </div>
                          )}
                      </>
                    )}

                    {annotation.type === "PLAN" && (
                      <>
                        <div className="text-sm text-gray-400">
                          <Markdown>{annotation.plan}</Markdown>
                        </div>
                        <div className="mt-2 space-y-1">
                          {annotation.queries.map((query, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-sm text-gray-400"
                            >
                              <SearchIcon className="size-4" />
                              <span>{query}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {annotation.type === "SOURCES" && (
                      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {annotation.sources.map((source, i) => (
                          <div
                            key={i}
                            className="flex gap-3 rounded-lg bg-gray-800 p-3"
                          >
                            <img
                              src={source.favicon}
                              alt=""
                              className="h-6 w-6 rounded-sm"
                            />
                            <div className="flex flex-col gap-1">
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sm font-medium text-blue-400 hover:text-blue-300"
                              >
                                {source.title}
                                <LinkIcon className="size-3" />
                              </a>
                              <p className="text-sm text-gray-400">
                                {source.snippet}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
