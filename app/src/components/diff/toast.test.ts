import { describe, test, expect } from "vitest";
import { toast } from "sonner";

describe("toast integration", () => {
	test("toast.error is a callable function", () => {
		expect(typeof toast.error).toBe("function");
	});

	test("toast.success is a callable function", () => {
		expect(typeof toast.success).toBe("function");
	});

	test("toast.error returns a toast id", () => {
		const id = toast.error("Test error message");
		expect(id).toBeDefined();
	});

	test("toast.success returns a toast id", () => {
		const id = toast.success("Test success message");
		expect(id).toBeDefined();
	});

	test("toast.error with description returns a toast id", () => {
		const id = toast.error("Stage failed", {
			description: "Permission denied on file.txt",
		});
		expect(id).toBeDefined();
	});

	test("toast.dismiss is a callable function", () => {
		expect(typeof toast.dismiss).toBe("function");
	});

	test("toast can be called with action button", () => {
		const id = toast.error("Operation failed", {
			action: {
				label: "Retry",
				onClick: () => {},
			},
		});
		expect(id).toBeDefined();
	});
});
