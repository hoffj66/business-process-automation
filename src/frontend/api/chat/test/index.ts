//import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import axios from "axios"

import { BufferWindowMemory, ChatMessageHistory } from "langchain/memory";
import { ChainValues } from "langchain/schema";
import { CogSearchRetrievalQAChain } from "../../langchainlibs/chains/cogSearchRetrievalQA";
import { CogSearchTool } from "../../langchainlibs/tools/cogsearch";
import { AgentExecutor } from "langchain/agents";
import { Tool } from "langchain/tools"
import { HotelAgent } from "../../langchainlibs/agents/hotel";
import { HotelsByGeoChain } from "../../langchainlibs/chains/hotelsByGeo";
import { HotelQAChain } from "../../langchainlibs/chains/hotelQA";
import { payload } from "./chainpayload"

import * as data from '../../local.settings.json'

process.env.OPENAI_API_TYPE = "azure"
process.env.AZURE_OPENAI_API_KEY = data.Values.OPENAI_KEY
process.env.AZURE_OPENAI_API_INSTANCE_NAME = `oai${data.Values.COSMOS_DB_CONTAINER}`
process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME = data.Values.OPENAI_DEPLOYMENT_TEXT
// process.env.AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME="gpt-35-turbo"
// process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME="gpt-35-turbo"
process.env.AZURE_OPENAI_API_VERSION = "2023-03-15-preview"
process.env.AZURE_OPENAI_API_BASE = data.Values.OPENAI_ENDPOINT
process.env.MAPS_API_KEY = data.Values.MAPS_API_KEY
process.env.COGSEARCH_URL = data.Values.COGSEARCH_URL
process.env.COGSEARCH_APIKEY = data.Values.COGSEARCH_APIKEY

const runChain = async (pipeline, history, prev): Promise<ChainValues> => {
  let chain

  if (pipeline.chainParameters.type === 'geolocation') {
    chain = new HotelsByGeoChain(pipeline.chainParameters, prev)
  } else if (pipeline.chainParameters.type === 'hotelqa') {
    chain = new HotelQAChain(pipeline.chainParameters)
  } else {
    chain = new CogSearchRetrievalQAChain(pipeline.chainParameters)
  }
  let outputKey: string
  if (pipeline.chainParameters.type === "refine") {
    outputKey = "output_text"
  } else {
    outputKey = "text"
  }

  const memory: BufferWindowMemory = new BufferWindowMemory({ k: pipeline.memorySize, memoryKey: "chat_history", outputKey: outputKey, chatHistory: convertToLangChainMessage(history) })
  const query = history[history.length - 1].user
  const out = await chain.run(query, memory)
  return out
}

const runAgent = async (pipeline, history): Promise<ChainValues> => {
  //pipeline.history = convertToLangChainMessage(history)
  //pipeline.parameters.tools[0].history = convertToLangChainMessage(history)
  //const tool = new LocationTool(pipeline.parameters.tools[0])
  const tools: Tool[] = []
  const memory: BufferWindowMemory = new BufferWindowMemory({ k: pipeline.memorySize, memoryKey: "chat_history", chatHistory: convertToLangChainMessage(history) })
  for (const t of pipeline.parameters.tools) {
    t.memory = memory
    let tool = new CogSearchTool(t)
    tools.push(tool)
  }
  const agent = new HotelAgent(pipeline)
  const executor = new AgentExecutor({
    agent: agent,
    tools: tools,
    maxIterations: 3
  });
  // let executor
  // switch (pipeline.subType) {
  //   case "zero-shot-react-description":
  //   case "chat-zero-shot-react-description":
  //   case "openai-functions":
  //     executor = await initializeAgentExecutorWithOptions(
  //       tools,
  //       new ChatOpenAI(pipeline.parameters.llmConfig),
  //       { agentType: pipeline.subType, verbose: true }
  //     );
  //     break;
  //   case "plan-and-execute":
  //     executor = PlanAndExecuteAgentExecutor.fromLLMAndTools({
  //       llm: new ChatOpenAI(pipeline.parameters.llmConfig),
  //       tools,
  //     });
  //     break;

  // }
  const query = history[history.length - 1].user
  const controller = new AbortController();

  setTimeout(() => {
    controller.abort();
  }, 30000);
  const result = await executor.call({
    input: query, signal: controller.signal, memory: memory

  });

  return result
}

const convertToMessage = (history) => {
  const messages = []
  for (const h of history) {
    if (h?.user) {
      messages.push({ role: "user", content: h.user })
    } if (h?.assistant) {
      messages.push({ role: "assistant", content: h.assistant })
    } if (h?.tool) {
      messages.push({ role: "tool", content: h.tool })
    }
  }

  return messages
}

const convertToLangChainMessage = (history) => {
  const messages = new ChatMessageHistory();
  //messages.addAIChatMessage(aiMessage)
  for (let i = 0; i < history.length - 1; i++) {  //ignore most recent user utterance
    //for (const h of history) {
    const h = history[i]
    if (h?.user) {
      messages.addUserMessage(h.user)
    } if (h?.assistant) {
      messages.addAIChatMessage(h.assistant)
    } if (h?.tool) {
      messages.addMessage(h.tool)
    }
  }

  return messages
}

const defaultChat = async (index, history) => {
  const url = `${process.env.OPENAI_ENDPOINT}openai/deployments/${process.env.OPENAI_DEPLOYMENT_TEXT}/extensions/chat/completions?api-version=2023-06-01-preview`
  const headers = {
    "Content-Type": "application/json",
    "api-key": process.env.OPENAI_KEY,
    "chatgpt_url": `${process.env.OPENAI_ENDPOINT}openai/deployments/${process.env.OPENAI_DEPLOYMENT_TEXT}/chat/completions?api-version=2023-03-15-preview`,
    "chatgpt_key": process.env.OPENAI_KEY,
    "accept": "*/*"

  }
  const body = {
    "dataSources": [
      {
        "type": "AzureCognitiveSearch",
        "parameters": {
          "endpoint": process.env.COGSEARCH_URL,
          "key": process.env.COGSEARCH_APIKEY,
          "indexName": index.name,
          "semanticConfiguration": "default",
          "queryType": "semantic",
          "fieldsMapping": {
            "contentFieldsSeparator": "\n",
            "contentFields": index.searchableFields,
            "filepathField": "filename",
            "titleField": "filename",
            "urlField": "filename"
          },
          "inScope": true,
          "roleInformation": "You are an AI assistant that helps people find information."
        }
      }
    ],
    "messages": convertToMessage(history),
    "deployment": process.env.OPENAI_DEPLOYMENT_TEXT,
    "temperature": 0,
    "top_p": 0,
    "max_tokens": 800,
    "stop": null,
    "stream": false
  }
  try {
    const { data } = await axios.post(url, body, { headers: headers })

    let answer = ''
    let citations = []
    for (const c of data.choices) {
      for (const m of c.messages) {
        if (m.role === 'tool') {
          const contentObj = JSON.parse(m.content)
          citations = contentObj.citations
        } else if (m.role === 'assistant') {
          answer = m.content
        }
      }
    }

    return { "data_points": citations, "answer": answer, "thoughts": JSON.stringify(data.choices) }

    // context.res = {
    //   body: { "data_points": citations, "answer": answer, "thoughts": JSON.stringify(data.choices) }
    // }

  } catch (err) {
    console.log(err)
    // context.res = {
    //   body: JSON.stringify(err)
    // }
  }

}

const run = async (pipeline: any, history: any, prev): Promise<ChainValues> => {

  if (pipeline.type === "chain") {
    return runChain(pipeline, history, prev)
  } else if (pipeline.type === 'agent') {
    return runAgent(pipeline, history)
  }

  return null
}

//const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
const go = async (payload, prev) => {
  try {
    if (payload.pipeline.name === 'default') {
      //return defaultChat(context, req)
      return null
    } else {
      const v = await run(payload.pipeline, payload.history, prev)
      let answer = ""
      if (v?.output) {
        answer = v.output
      } else if (v?.text) {
        answer = v.text
      } else if (v?.output_text) {
        answer = v.output_text
      }

      //let data_points = []
      // if (v?.sourceDocuments) {
      //   for (const d of v.sourceDocuments) {
      //     data_points.push({
      //       title: d.metadata.filename,
      //       content: d.pageContent
      //     })
      //   }
      // }

      return { "data_points": v.sourceDocuments, "answer": answer, "thoughts": "" }
      // context.res = {
      //   body: { "data_points": data_points, "answer": answer, "thoughts": "" }
      // }
    }
  } catch (err) {
    return { "data_points": [], "answer": `Something went wrong. ${err.message}`, "thoughts": "" }
    // context.res = {
    //   body: { "data_points": [], "answer": `Something went wrong. ${err.message}`, "thoughts": "" }
    // }
  }


  //defaultChat(context, req)
}

//let tempHistory = payload.history
//let mypayload = agentPayload

go(payload("can you recommend a hotel near raleigh nc that is pet friendly?"), null).then(out => {
  go(payload("does it have free wifi?"), out).then(out2 => {
    go(payload("can you recommend a hotel near virginia beach that is pet friendly"), out2).then(out3 => {
      console.log(out3)
    })
  })
  // tempHistory[0]["assistant"] = out.answer
  // tempHistory.push({
  //   "user": "what is the parking policy?"
  // })
  // mypayload.history = tempHistory
  // go(mypayload).then(out => {
  //   console.log(out)
  // })
}).catch(err => {
  console.log(err)
})



