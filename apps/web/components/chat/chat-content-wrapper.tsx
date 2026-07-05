interface ChatContentWrapperProps {
    children: React.ReactNode;
}

export const ChatContentWrapper = ({ children }: ChatContentWrapperProps) => {
    return (
        <div className="flex-1 flex flex-col overflow-hidden relative">
            {children}
        </div>
    );
};
