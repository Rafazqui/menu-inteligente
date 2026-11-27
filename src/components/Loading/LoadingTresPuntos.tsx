import "./loading.css";

export default function LoadingTresPuntos() {
    return (
        <div className="flex gap-1 shrink-0" aria-hidden>
            <div className="dot size-2 rounded-full bg-brand"></div>
            <div className="dot size-2 rounded-full bg-brand [animation-delay:0.15s]" style={{ animationDelay: '0.1s' }}></div>
            <div className="dot size-2 rounded-full bg-brand [animation-delay:0.3s]" style={{ animationDelay: '0.2s' }}></div>
        </div>
    );
}