type ErrorPanelProps = {
  message: string;
};

export function ErrorPanel({ message }: ErrorPanelProps) {
  return (
    <section className="panel mb-4 border-red-300 bg-red-50">
      <p className="m-0 text-sm text-red-700">{message}</p>
    </section>
  );
}
