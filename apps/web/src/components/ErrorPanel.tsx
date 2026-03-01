type ErrorPanelProps = {
  message: string;
};

export function ErrorPanel({ message }: ErrorPanelProps) {
  return (
    <section className="panel mb-4 border-red-200 bg-red-50/90">
      <p className="m-0 text-sm font-medium text-red-700">{message}</p>
    </section>
  );
}
