export type ProblemDetail = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
};

export class ApiProblemError extends Error {
  readonly problem: ProblemDetail;

  constructor(problem: ProblemDetail) {
    super(problem.detail ?? problem.title);
    this.name = "ApiProblemError";
    this.problem = problem;
  }
}
