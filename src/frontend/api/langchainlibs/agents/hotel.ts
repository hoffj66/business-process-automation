import { CallbackManager } from "langchain/callbacks";
import { BaseSingleActionAgent } from "langchain/agents";
import { AgentStep, ChainValues, AgentAction, AgentFinish } from "langchain/schema";


export class HotelAgent extends BaseSingleActionAgent {
    plan = async (steps: AgentStep[], inputs: ChainValues, callbackManager?: CallbackManager): Promise<AgentAction | AgentFinish> => {
        if (steps.length > 0) {
            const finish : AgentFinish = {
                returnValues: {steps : steps, inputs : inputs, output : steps[0].observation},
                log: "finished"
            }
            return finish
        } else {
            const action: AgentAction = {
                tool: "search_location",
                toolInput: inputs["input"],
                log: "Searching Location"
            }
            console.log(steps)
            console.log(inputs)
            console.log(callbackManager)
            return action
        }
    }
    get inputKeys(): string[] {
        return []
    }
    _agentActionType(): string {
        return "single"
        //throw new Error("Method not implemented.");
    }
    lc_namespace: string[];

}