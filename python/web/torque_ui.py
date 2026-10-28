"""
Robstride 2-Link Robotic Arm Torque Calculator UI.

This module provides a clean Tkinter graphical user interface for computing
continuous and peak holding torques for a 2-link robotic arm under worst-case
horizontal static loading conditions.
"""

from __future__ import annotations

import sys
import tkinter as tk
from tkinter import messagebox, ttk
from typing import Any, Dict, Optional, Tuple


class TorqueCalculatorUI:
    """
    Main GUI application class for the 2-Link Robotic Arm Torque Calculator.
    """

    # Default values for initial load and reset
    DEFAULTS: Dict[str, str] = {
        "motor_weight": "0.500",
        "base_link_weight": "0.400",
        "fore_link_weight": "0.300",
        "payload_weight": "0.500",
        "base_link_length": "0.250",
        "fore_link_length": "0.250",
        "base_angular_accel": "10.0",
        "elbow_angular_accel": "10.0",
    }

    # Definition of input fields (field_key, label_text, unit_text, tooltip)
    FIELD_SPECS = [
        (
            "motor_weight",
            "Motor Weight",
            "kg",
            "Weight of an actuator motor (loads shoulder at elbow position)",
        ),
        (
            "base_link_weight",
            "Base Link Weight",
            "kg",
            "Weight of proximal/shoulder link",
        ),
        (
            "fore_link_weight",
            "Fore Link Weight",
            "kg",
            "Weight of distal/elbow link",
        ),
        (
            "payload_weight",
            "Payload Weight",
            "kg",
            "Weight carried at the distal tip of fore link",
        ),
        (
            "base_link_length",
            "Base Link Distance (c-to-c)",
            "m",
            "Center-to-center length of base link",
        ),
        (
            "fore_link_length",
            "Fore Link Distance (c-to-c)",
            "m",
            "Center-to-center length of fore link",
        ),
        (
            "base_angular_accel",
            "Base Angular Accel",
            "rad/s²",
            "Base joint angular acceleration",
        ),
        (
            "elbow_angular_accel",
            "Elbow Angular Accel",
            "rad/s²",
            "Elbow joint angular acceleration",
        ),
    ]

    def __init__(self, root: tk.Tk) -> None:
        """
        Initialize the Torque Calculator UI.

        Args:
            root: The root Tkinter window.
        """
        self.root = root
        self.root.title("Robstride - 2-Link Arm Torque Calculator")
        self.root.geometry("640x780")
        self.root.minsize(580, 700)

        # Apply modern ttk styles
        self._setup_styles()

        # Variable storage
        self.entry_vars: Dict[str, tk.StringVar] = {}
        self.entries: Dict[str, ttk.Entry] = {}

        # Result display variables
        self.base_cont_var = tk.StringVar(value="-- Nm")
        self.base_peak_var = tk.StringVar(value="-- Nm")
        self.elbow_cont_var = tk.StringVar(value="-- Nm")
        self.elbow_peak_var = tk.StringVar(value="-- Nm")
        self.reach_var = tk.StringVar(value="-- m")
        self.mass_var = tk.StringVar(value="-- kg")
        self.status_var = tk.StringVar(value="Enter parameters and click 'Calculate Torques'")

        # Build UI layout
        self._create_widgets()

        # Bind keyboard shortcuts
        self.root.bind("<Return>", lambda event: self.calculate())

    def _setup_styles(self) -> None:
        """Configure ttk theme and custom styles."""
        self.style = ttk.Style(self.root)
        available_themes = self.style.theme_names()
        if "clam" in available_themes:
            self.style.theme_use("clam")

        # Fonts
        self.font_title = ("Segoe UI", 14, "bold")
        self.font_subtitle = ("Segoe UI", 9)
        self.font_header = ("Segoe UI", 10, "bold")
        self.font_regular = ("Segoe UI", 9)
        self.font_bold = ("Segoe UI", 9, "bold")
        self.font_val_large = ("Segoe UI", 13, "bold")
        self.font_status = ("Segoe UI", 8)

        # Style colors
        self.style.configure(".", font=self.font_regular)
        self.style.configure("Header.TLabel", font=self.font_header)
        self.style.configure("Accent.TButton", font=self.font_bold, padding=6)
        self.style.configure("Action.TButton", padding=5)

    def _create_widgets(self) -> None:
        """Create all widgets in the application window."""
        # Top-level main container with padding
        main_container = ttk.Frame(self.root, padding="16 12 16 12")
        main_container.pack(fill=tk.BOTH, expand=True)

        # 1. Header Banner
        header_frame = tk.Frame(main_container, bg="#1E293B", padx=16, pady=12)
        header_frame.pack(fill=tk.X, pady=(0, 12))

        lbl_app_title = tk.Label(
            header_frame,
            text="2-Link Robotic Arm Torque Calculator",
            font=self.font_title,
            fg="#F8FAFC",
            bg="#1E293B",
            anchor="w",
        )
        lbl_app_title.pack(fill=tk.X)

        lbl_app_sub = tk.Label(
            header_frame,
            text="Static holding & peak torque estimation under worst-case horizontal extension",
            font=self.font_subtitle,
            fg="#94A3B8",
            bg="#1E293B",
            anchor="w",
        )
        lbl_app_sub.pack(fill=tk.X, pady=(2, 0))

        # 2. Input Parameters Section
        inputs_lframe = ttk.LabelFrame(main_container, text=" Input Parameters (Standard Metric) ", padding="12 10 12 10")
        inputs_lframe.pack(fill=tk.X, pady=(0, 10))

        for row_idx, (key, label_text, unit, tooltip) in enumerate(self.FIELD_SPECS):
            # Parameter Label
            lbl = ttk.Label(inputs_lframe, text=f"{label_text}:")
            lbl.grid(row=row_idx, column=0, sticky="w", padx=(4, 8), pady=4)

            # Entry box
            var = tk.StringVar(value=self.DEFAULTS.get(key, ""))
            self.entry_vars[key] = var
            entry = ttk.Entry(inputs_lframe, textvariable=var, width=14, justify="right")
            entry.grid(row=row_idx, column=1, sticky="w", padx=(0, 6), pady=4)
            self.entries[key] = entry

            # Unit Label
            unit_lbl = ttk.Label(inputs_lframe, text=unit, width=4, foreground="#475569")
            unit_lbl.grid(row=row_idx, column=2, sticky="w", padx=(0, 12), pady=4)

            # Tooltip / Hint description
            hint_lbl = ttk.Label(inputs_lframe, text=tooltip, foreground="#64748B", font=("Segoe UI", 8, "italic"))
            hint_lbl.grid(row=row_idx, column=3, sticky="w", padx=(4, 4), pady=4)

        inputs_lframe.columnconfigure(3, weight=1)

        # 3. Action Buttons Section
        btn_frame = ttk.Frame(main_container)
        btn_frame.pack(fill=tk.X, pady=(0, 12))

        btn_calc = ttk.Button(
            btn_frame,
            text="⚡ Calculate Torques",
            style="Accent.TButton",
            command=self.calculate,
        )
        btn_calc.pack(side=tk.LEFT, padx=(0, 8), ipadx=10)

        btn_reset = ttk.Button(
            btn_frame,
            text="Reset Defaults",
            style="Action.TButton",
            command=self.reset_defaults,
        )
        btn_reset.pack(side=tk.LEFT, padx=(0, 8))

        btn_clear = ttk.Button(
            btn_frame,
            text="Clear All",
            style="Action.TButton",
            command=self.clear_all,
        )
        btn_clear.pack(side=tk.LEFT)

        # 4. Results Section
        results_lframe = ttk.LabelFrame(main_container, text=" Calculated Torque Results ", padding="12 10 12 10")
        results_lframe.pack(fill=tk.BOTH, expand=True, pady=(0, 8))

        # Result Cards Container (2 Columns)
        cards_frame = ttk.Frame(results_lframe)
        cards_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 8))
        cards_frame.columnconfigure(0, weight=1)
        cards_frame.columnconfigure(1, weight=1)

        # Base Joint Card
        base_card = tk.LabelFrame(
            cards_frame,
            text=" Base Motor (Shoulder Joint) ",
            font=self.font_header,
            fg="#0F172A",
            bg="#F1F5F9",
            padx=12,
            pady=10,
            relief=tk.GROOVE,
            bd=1,
        )
        base_card.grid(row=0, column=0, sticky="nsew", padx=(0, 6), pady=4)

        self._build_joint_metrics(
            parent=base_card,
            cont_var=self.base_cont_var,
            peak_var=self.base_peak_var,
            accent_color="#0284C7",
        )

        # Elbow Joint Card
        elbow_card = tk.LabelFrame(
            cards_frame,
            text=" Elbow Motor (Elbow Joint) ",
            font=self.font_header,
            fg="#0F172A",
            bg="#F1F5F9",
            padx=12,
            pady=10,
            relief=tk.GROOVE,
            bd=1,
        )
        elbow_card.grid(row=0, column=1, sticky="nsew", padx=(6, 0), pady=4)

        self._build_joint_metrics(
            parent=elbow_card,
            cont_var=self.elbow_cont_var,
            peak_var=self.elbow_peak_var,
            accent_color="#0D9488",
        )

        # Auxiliary Metrics Panel (Reach & Mass)
        aux_frame = tk.Frame(results_lframe, bg="#E2E8F0", padx=10, pady=8)
        aux_frame.pack(fill=tk.X, pady=(4, 0))

        aux_lbl1 = tk.Label(aux_frame, text="Total Extended Reach:", font=self.font_bold, bg="#E2E8F0", fg="#334155")
        aux_lbl1.pack(side=tk.LEFT, padx=(4, 4))

        aux_val1 = tk.Label(aux_frame, textvariable=self.reach_var, font=self.font_bold, bg="#E2E8F0", fg="#0F172A")
        aux_val1.pack(side=tk.LEFT, padx=(0, 20))

        aux_lbl2 = tk.Label(aux_frame, text="Total Moving Mass:", font=self.font_bold, bg="#E2E8F0", fg="#334155")
        aux_lbl2.pack(side=tk.LEFT, padx=(4, 4))

        aux_val2 = tk.Label(aux_frame, textvariable=self.mass_var, font=self.font_bold, bg="#E2E8F0", fg="#0F172A")
        aux_val2.pack(side=tk.LEFT)

        # 5. Status Bar at Bottom
        status_bar = ttk.Frame(main_container)
        status_bar.pack(fill=tk.X, side=tk.BOTTOM, pady=(4, 0))

        self.status_label = ttk.Label(
            status_bar,
            textvariable=self.status_var,
            font=self.font_status,
            foreground="#64748B",
        )
        self.status_label.pack(side=tk.LEFT, fill=tk.X)

    def _build_joint_metrics(
        self,
        parent: tk.Widget,
        cont_var: tk.StringVar,
        peak_var: tk.StringVar,
        accent_color: str,
    ) -> None:
        """Helper to build metric rows inside a joint result card."""
        # Continuous Torque Row
        row1 = tk.Frame(parent, bg="#F1F5F9")
        row1.pack(fill=tk.X, pady=(4, 6))

        lbl_c = tk.Label(
            row1,
            text="Continuous Torque:",
            font=self.font_regular,
            bg="#F1F5F9",
            fg="#475569",
            anchor="w",
        )
        lbl_c.pack(side=tk.LEFT)

        val_c = tk.Label(
            row1,
            textvariable=cont_var,
            font=self.font_val_large,
            bg="#F1F5F9",
            fg="#0F172A",
            anchor="e",
        )
        val_c.pack(side=tk.RIGHT)

        # Separator line
        sep = tk.Frame(parent, height=1, bg="#CBD5E1")
        sep.pack(fill=tk.X, pady=2)

        # Peak Torque Row
        row2 = tk.Frame(parent, bg="#F1F5F9")
        row2.pack(fill=tk.X, pady=(6, 4))

        lbl_p = tk.Label(
            row2,
            text="Peak Torque:",
            font=self.font_regular,
            bg="#F1F5F9",
            fg="#475569",
            anchor="w",
        )
        lbl_p.pack(side=tk.LEFT)

        val_p = tk.Label(
            row2,
            textvariable=peak_var,
            font=self.font_val_large,
            bg="#F1F5F9",
            fg=accent_color,
            anchor="e",
        )
        val_p.pack(side=tk.RIGHT)

    def validate_inputs(self) -> Optional[Dict[str, float]]:
        """
        Validate all input fields.

        Returns:
            Dictionary of parsed floating point inputs if valid, None otherwise.
        """
        parsed: Dict[str, float] = {}

        # Human-friendly field display names for warnings
        field_display_names = {
            "motor_weight": "Motor weight",
            "base_link_weight": "Base link weight",
            "fore_link_weight": "Fore link weight",
            "payload_weight": "Payload weight",
            "base_link_length": "Base link center-to-center distance",
            "fore_link_length": "Fore link center-to-center distance",
            "base_angular_accel": "Base angular acceleration",
            "elbow_angular_accel": "Elbow angular acceleration",
        }

        for key, display_name in field_display_names.items():
            raw_val = self.entry_vars[key].get().strip()

            if not raw_val:
                messagebox.showwarning(
                    "Missing Input",
                    f"Please enter a value for '{display_name}'.",
                    parent=self.root,
                )
                self.status_var.set(f"Validation Warning: '{display_name}' is empty.")
                self.entries[key].focus_set()
                return None

            try:
                val = float(raw_val)
            except ValueError:
                messagebox.showwarning(
                    "Invalid Number",
                    f"'{display_name}' must be a valid numeric value.\nReceived: '{raw_val}'",
                    parent=self.root,
                )
                self.status_var.set(f"Validation Warning: '{raw_val}' is not a valid number.")
                self.entries[key].focus_set()
                return None

            if val < 0:
                messagebox.showwarning(
                    "Negative Value Warning",
                    f"'{display_name}' cannot be negative.\nReceived: {val}",
                    parent=self.root,
                )
                self.status_var.set(f"Validation Warning: '{display_name}' cannot be negative.")
                self.entries[key].focus_set()
                return None

            if key in ("base_link_length", "fore_link_length") and val == 0:
                messagebox.showwarning(
                    "Zero Length Warning",
                    f"'{display_name}' must be greater than zero.",
                    parent=self.root,
                )
                self.status_var.set(f"Validation Warning: '{display_name}' must be > 0.")
                self.entries[key].focus_set()
                return None

            parsed[key] = val

        return parsed

    def calculate(self) -> None:
        """
        Triggered by the 'Calculate' button.
        Imports torque_math, validates inputs, computes torques, and updates display.
        """
        # Validate inputs first
        inputs = self.validate_inputs()
        if inputs is None:
            return

        # Import the torque_math module dynamically as required
        try:
            import torque_math
            from torque_math import ArmParameters, TwoLinkTorqueCalculator
        except ImportError as exc:
            messagebox.showerror(
                "Module Error",
                f"Could not import 'torque_math' module.\nEnsure 'torque_math.py' is in the python path.\n\nError: {exc}",
                parent=self.root,
            )
            self.status_var.set(f"Error: Failed to import torque_math ({exc})")
            return

        # Instantiate ArmParameters and run calculation
        try:
            params = ArmParameters(
                motor_weight=inputs["motor_weight"],
                base_link_weight=inputs["base_link_weight"],
                fore_link_weight=inputs["fore_link_weight"],
                payload_weight=inputs["payload_weight"],
                base_link_length=inputs["base_link_length"],
                fore_link_length=inputs["fore_link_length"],
                base_angular_accel=inputs["base_angular_accel"],
                elbow_angular_accel=inputs["elbow_angular_accel"],
            )
            result = TwoLinkTorqueCalculator.calculate(params)
        except Exception as exc:
            messagebox.showerror(
                "Calculation Error",
                f"An error occurred during torque calculation:\n{exc}",
                parent=self.root,
            )
            self.status_var.set(f"Calculation Error: {exc}")
            return

        # Update Results in the UI
        self.base_cont_var.set(f"{result.base.continuous_torque:.2f} Nm")
        self.base_peak_var.set(f"{result.base.peak_torque:.2f} Nm")

        self.elbow_cont_var.set(f"{result.elbow.continuous_torque:.2f} Nm")
        self.elbow_peak_var.set(f"{result.elbow.peak_torque:.2f} Nm")

        self.reach_var.set(f"{result.total_reach:.3f} m ({result.total_reach * 1000:.0f} mm)")
        self.mass_var.set(f"{result.total_moving_mass:.3f} kg")

        self.status_var.set(
            f"Success: Calculation complete. Base Cont: {result.base.continuous_torque:.2f} Nm | Elbow Cont: {result.elbow.continuous_torque:.2f} Nm"
        )

        if result.base.continuous_torque > 100 or result.elbow.continuous_torque > 100:
            messagebox.showwarning(
                "Physical Hazard Warning",
                "Calculated continuous torque exceeds 100 Nm. This is physically hazardous. Ensure proper safety constraints.",
                parent=self.root,
            )

    def reset_defaults(self) -> None:
        """Reset all input fields to their default values."""
        for key, val in self.DEFAULTS.items():
            self.entry_vars[key].set(val)
        self.clear_results()
        self.status_var.set("Input parameters reset to default values.")

    def clear_all(self) -> None:
        """Clear all input fields and results."""
        for var in self.entry_vars.values():
            var.set("")
        self.clear_results()
        self.status_var.set("All input fields cleared.")

    def clear_results(self) -> None:
        """Reset the result displays to empty state."""
        self.base_cont_var.set("-- Nm")
        self.base_peak_var.set("-- Nm")
        self.elbow_cont_var.set("-- Nm")
        self.elbow_peak_var.set("-- Nm")
        self.reach_var.set("-- m")
        self.mass_var.set("-- kg")


def main() -> None:
    """Run the Torque Calculator Tkinter application loop."""
    root = tk.Tk()
    app = TorqueCalculatorUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
