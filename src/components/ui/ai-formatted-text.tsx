import React from "react";

interface AIFormattedTextProps {
  text: string;
  className?: string;
}

/**
 * Renders AI-generated text with clean formatting.
 * Strips markdown artifacts (###, **, *) and renders as proper HTML.
 */
export const AIFormattedText: React.FC<AIFormattedTextProps> = ({ text, className = "" }) => {
  const lines = text.split('\n').filter(line => line.trim() !== '');

  const formatLine = (line: string): React.ReactNode => {
    // Remove heading markers
    line = line.replace(/^#{1,4}\s+/, '');
    
    // Convert **bold** to <strong>
    const parts: React.ReactNode[] = [];
    const regex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(cleanAsterisks(line.slice(lastIndex, match.index)));
      }
      parts.push(<strong key={match.index}>{match[1]}</strong>);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(cleanAsterisks(line.slice(lastIndex)));
    }

    return parts.length > 0 ? parts : cleanAsterisks(line);
  };

  // Remove stray single asterisks used for emphasis
  const cleanAsterisks = (text: string): string => {
    return text.replace(/\*([^*]+)\*/g, '$1').replace(/\*/g, '');
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        
        // Bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-1">
              <span className="text-primary mt-1.5 text-[6px]">●</span>
              <span className="text-xs text-foreground leading-relaxed">{formatLine(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Numbered items
        const numberedMatch = trimmed.match(/^\d+[\.\)]\s+/);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-1">
              <span className="text-muted-foreground text-xs font-medium min-w-[16px]">{numberedMatch[0].trim()}</span>
              <span className="text-xs text-foreground leading-relaxed">{formatLine(trimmed.slice(numberedMatch[0].length))}</span>
            </div>
          );
        }

        // Regular paragraph
        return (
          <p key={idx} className="text-xs text-foreground leading-relaxed">
            {formatLine(trimmed)}
          </p>
        );
      })}
    </div>
  );
};
