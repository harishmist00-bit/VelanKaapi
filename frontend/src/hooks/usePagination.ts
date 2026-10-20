import { useState } from "react";

export function usePagination(pageSize = 20) {
  const [page, setPage] = useState(1);
  return { page, setPage, pageSize, reset: () => setPage(1) };
}
