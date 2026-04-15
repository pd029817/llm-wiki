import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SettingsPage from "./page";

const initialConfig = {
  id: "cfg-1",
  categories: ["기술문서", "운영"],
  rules: {
    page_template: "# {{title}}",
    terminology: { "올케어": "올케어플러스" },
  },
};

beforeEach(() => {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (!init || init.method === undefined || init.method === "GET") {
      return Promise.resolve({
        ok: true,
        json: async () => initialConfig,
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as unknown as typeof fetch;
});

async function renderAndLoad() {
  render(<SettingsPage />);
  await waitFor(() => {
    expect(screen.queryByText(/로딩 중/)).not.toBeInTheDocument();
  });
}

describe("SettingsPage", () => {
  it("shows loading state before fetch resolves", () => {
    render(<SettingsPage />);
    expect(screen.getByText(/로딩 중/)).toBeInTheDocument();
  });

  it("renders categories, template, terminology after load", async () => {
    await renderAndLoad();
    expect(screen.getByRole("heading", { level: 1, name: "설정" })).toBeInTheDocument();
    expect(screen.getByText("기술문서")).toBeInTheDocument();
    expect(screen.getByText("운영")).toBeInTheDocument();
    expect((screen.getByDisplayValue("# {{title}}") as HTMLTextAreaElement).value).toBe("# {{title}}");
    expect(screen.getByText("올케어")).toBeInTheDocument();
    expect(screen.getByText("올케어플러스")).toBeInTheDocument();
  });

  it("auto-persists when a category is added", async () => {
    await renderAndLoad();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    fireEvent.change(screen.getByPlaceholderText("새 카테고리"), { target: { value: "장애" } });
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[0]);

    expect(screen.getByText("장애")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.categories).toEqual(["기술문서", "운영", "장애"]);
    expect(await screen.findByText(/저장됨/)).toBeInTheDocument();
  });

  it("trims whitespace and ignores duplicate category additions", async () => {
    await renderAndLoad();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    fireEvent.change(screen.getByPlaceholderText("새 카테고리"), { target: { value: "  기술문서  " } });
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[0]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("auto-persists when a category is removed", async () => {
    await renderAndLoad();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const chip = screen.getByText("운영").closest("span")!;
    const removeBtn = chip.querySelector("button")!;
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.categories).toEqual(["기술문서"]);
    expect(screen.queryByText("운영")).not.toBeInTheDocument();
  });

  it("shows error status when category persist fails", async () => {
    await renderAndLoad();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    fireEvent.change(screen.getByPlaceholderText("새 카테고리"), { target: { value: "장애" } });
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[0]);
    expect(await screen.findByText(/저장 실패/)).toBeInTheDocument();
  });

  it("auto-persists when a terminology entry is added", async () => {
    await renderAndLoad();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    fireEvent.change(screen.getByPlaceholderText("용어"), { target: { value: "SKT" } });
    fireEvent.change(screen.getByPlaceholderText("통일 표기"), { target: { value: "SK텔레콤" } });
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[1]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.rules.terminology).toMatchObject({ SKT: "SK텔레콤" });
    expect(await screen.findByText(/저장됨/)).toBeInTheDocument();
  });

  it("auto-persists when a terminology entry is removed", async () => {
    await renderAndLoad();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const termRow = screen.getByText("올케어").closest("div")!;
    const removeBtn = termRow.querySelector("button[title='삭제']") as HTMLButtonElement;
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.rules.terminology).not.toHaveProperty("올케어");
  });

  it("PUTs full config when 저장 is clicked", async () => {
    await renderAndLoad();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      id: "cfg-1",
      categories: ["기술문서", "운영"],
      rules: { page_template: "# {{title}}" },
    });
  });
});
