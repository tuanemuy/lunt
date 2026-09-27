import type { ChangeEventHandler, ReactNode } from "react";
import { type FieldRequirement, Fieldset } from "../Field";

export type Choice<V extends string> = {
  value: V;
  label: string;
  disabled?: boolean;
};

type ChoiceGroupProps<V extends string> = {
  legend: string;
  name: string;
  choices: ReadonlyArray<Choice<V>>;
  requirement?: FieldRequirement;
  help?: ReactNode;
  error?: string;
} & (
  | { value: V | null; onChange: (value: V) => void; defaultValue?: never }
  | { defaultValue?: V; value?: never; onChange?: never }
);

/**
 * A single choice drawn as Lunt/Chip pills (営業状況 and the like). Native
 * radios keep keyboard selection and form submission; controlled when
 * `value` is passed, otherwise uncontrolled from `defaultValue`.
 */
export function ChoiceGroup<V extends string>(props: ChoiceGroupProps<V>) {
  const { legend, name, choices, requirement, help, error } = props;
  const handleChange: ChangeEventHandler<HTMLInputElement> | undefined =
    props.onChange === undefined
      ? undefined
      : (event) => {
          const picked = choices.find(
            (choice) => choice.value === event.currentTarget.value,
          );
          if (picked !== undefined) props.onChange?.(picked.value);
        };
  return (
    <Fieldset
      legend={legend}
      {...(requirement === undefined ? {} : { requirement })}
      {...(help === undefined ? {} : { help })}
      {...(error === undefined ? {} : { error })}
    >
      <div className="m-choices">
        {choices.map((choice) => (
          <label className="m-choice" key={choice.value}>
            <input
              type="radio"
              name={name}
              value={choice.value}
              disabled={choice.disabled}
              aria-invalid={error === undefined ? undefined : true}
              {...(props.onChange === undefined
                ? { defaultChecked: choice.value === props.defaultValue }
                : {
                    checked: choice.value === props.value,
                    onChange: handleChange,
                  })}
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
    </Fieldset>
  );
}
