package models

// RequestStep holds the HTTP fields for a flow request step
type RequestStep struct {
	Method   string            `json:"method"`
	URL      string            `json:"url"`
	Headers  map[string]string `json:"headers"`
	Params   map[string]string `json:"params"`
	Body     string            `json:"body"`
	BodyType string            `json:"bodyType"`
}

// Extraction defines how to pull a value from a response and store it as a variable
type Extraction struct {
	Variable   string `json:"variable"`
	Source     string `json:"source"` // "body", "header", "status"
	Header     string `json:"header,omitempty"`
	Regex      string `json:"regex,omitempty"`
	MatchGroup int    `json:"matchGroup"`
}

// Assertion defines a check to perform against a response
type Assertion struct {
	Source   string `json:"source"` // "body", "header", "status"
	Header   string `json:"header,omitempty"`
	Operator string `json:"operator"` // equals, not_equals, contains, not_contains, matches, not_matches, greater_than, less_than
	Expected string `json:"expected"`
}

// StepCondition defines a conditional expression used in condition/loop/assert steps
type StepCondition struct {
	Left     string `json:"left"`
	Operator string `json:"operator"`
	Right    string `json:"right"`
}

// FlowEdge represents a directed connection between two top-level flow steps
type FlowEdge struct {
	ID    string `json:"id"`
	From  string `json:"from"`
	To    string `json:"to"`
	Label string `json:"label,omitempty"` // "then", "else", or empty
}

// FlowStep represents a single step in a flow
type FlowStep struct {
	ID      string `json:"id"`
	Type    string `json:"type"` // request, condition, loop, delay, set_variable, assert
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	// Canvas position
	X int `json:"x"`
	Y int `json:"y"`

	// request step fields
	Request     *RequestStep `json:"request,omitempty"`
	Extractions []Extraction `json:"extractions,omitempty"`
	Assertions  []Assertion  `json:"assertions,omitempty"`

	// set_variable step fields
	VariableName  string `json:"variableName,omitempty"`
	VariableValue string `json:"variableValue,omitempty"`

	// condition step fields
	Condition *StepCondition `json:"condition,omitempty"`
	ThenSteps []FlowStep     `json:"thenSteps,omitempty"`
	ElseSteps []FlowStep     `json:"elseSteps,omitempty"`

	// loop step fields
	LoopType      string         `json:"loopType,omitempty"`
	LoopCount     int            `json:"loopCount,omitempty"`
	LoopCondition *StepCondition `json:"loopCondition,omitempty"`
	LoopSteps     []FlowStep     `json:"loopSteps,omitempty"`

	// delay step fields
	DelayMs int `json:"delayMs,omitempty"`

	// assert step fields
	AssertCondition *StepCondition `json:"assertCondition,omitempty"`
	AssertMessage   string         `json:"assertMessage,omitempty"`
}

// Flow represents a saved automation flow
type Flow struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Steps     []FlowStep        `json:"steps"`
	Edges     []FlowEdge        `json:"edges,omitempty"`
	Variables map[string]string `json:"variables"`
	CreatedAt int64             `json:"createdAt"`
	UpdatedAt int64             `json:"updatedAt"`
}
