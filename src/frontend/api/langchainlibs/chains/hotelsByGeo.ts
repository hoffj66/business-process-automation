import { ChainValues } from "langchain/schema"
import { OpenAIBaseInput } from "langchain/dist/types/openai-types"
import { LLMChain } from "langchain/chains";
import { BufferWindowMemory } from "langchain/memory";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain";
import axios, { AxiosRequestConfig } from "axios";
import { Document } from "langchain/document";


export class HotelsByGeoChain {
    private _parameters: any
    private _prev
    constructor(parameters: any, prev: any) {
        this._parameters = parameters
        this._prev = prev
    }

    private getPrompt = (prompt) => {
        return (prompt && prompt.length > 0) ? PromptTemplate.fromTemplate(prompt) : null
    }

    private _search = async (search: string, filter: string, numDocs: number, indexConfig: any): Promise<any[]> => {
        try {

            const headers: AxiosRequestConfig = {
                headers: {
                    "Content-Type": "application/json",
                    "api-key": process.env.COGSEARCH_APIKEY
                }
            }
            let body: any = {
                search: search,
                count: true,
                facets: [],
                filter: filter,
                top: numDocs,
                queryLanguage: "en"
            }
            if (indexConfig) {
                let url = `${process.env.COGSEARCH_URL}/indexes/${indexConfig.name}/docs/search?api-version=2021-04-30-Preview`
                const axiosResult = await axios.post(url, body, headers)


                return axiosResult.data.value
            }

        } catch (err) {
            console.log(err)
        }
        return []
    }

    private _getText = (searchables, data) => {
        try {
            if (!searchables || searchables.length === 0) {
                return ""
            }
            let out = ""

            for (const s of searchables) {
                let currentData = data
                for (const i of s.split('/')) {
                    if (Array.isArray(currentData[i])) {
                        currentData = currentData[i][0]
                    } else {
                        currentData = currentData[i]
                    }
                }
                out += `${s} : ${currentData}\n`
            }
            return out
        } catch (err) {
            console.log(err)
        }

    }

    public run = async (query: string, memory: BufferWindowMemory): Promise<ChainValues> => {
        //memory.chatHistory.addUserMessage(query)
        //const retriever: BaseRetriever = new CogSearchRetriever(this._parameters.retriever)
        const llmConfig: OpenAIBaseInput = this._parameters.llmConfig
        const llm = new ChatOpenAI(llmConfig)
        const customPrompt =
            `Return the location that is being discussed.  If there is no specific location, return "none".
        Example: 
        Query: I'd like to find some hotels near Austin, TX.  
        Result: Austin, TX
        Query: I'd like to find some hotels near Disney World 
        Result: Disney World
        Query: I'd like to find some hotels near the track at VIR
        Result: track at VIR
        Query: I like petting cats.  Why do they bite me?
        Result: none
        Query: {question} 
        Result:\n`
        const queryChain = new LLMChain({ prompt: this.getPrompt(customPrompt), llm: llm })
        const targetLocation = await queryChain.call({ question: query })
        console.log(JSON.stringify(targetLocation))
        let docText = ""
        let docs = []
        let previousAnswer = ""
        if (targetLocation.text === 'none') {
            docs = this._prev.data_points
            previousAnswer = this._prev.answer.text
        } else {
            const maps = await axios.get(`https://atlas.microsoft.com/search/address/json?&subscription-key=${process.env.MAPS_API_KEY}&api-version=1.0&language=en-US&query=${targetLocation.text}&countryset=US`)
            if (maps.data.results.length === 0) {
                return { text: `I could not get the coordinates for ${targetLocation.text}. Perhaps use the name of the town or rephrase it?`, sourceDocuments: [] }
            }

            let results = "Hotels: \n"

            if (maps.data.results.length > 0 && maps.data.results[0]?.position) {
                const geo = maps.data.results[0].position
                if (geo.lat) {
                    const filter = `geo.distance(geometry, geography'POINT(${geo.lon} ${geo.lat})') le 50`
                    const searchResults = await this._search("", filter, this._parameters.retriever.numDocs, this._parameters.retriever.indexConfig)

                    if (searchResults.length === 0) {
                        return { text: `No results were found while searching near ${targetLocation.text}`, sourceDocuments: [] }
                    }

                    for (const v of searchResults) {
                        const doc: Document<Record<string, any>> = {
                            pageContent: this._getText(this._parameters.retriever.indexConfig.searchableFields, v),
                            metadata: v
                        }
                        docText += doc.pageContent + "\n\n"
                        docs.push(doc)
                    }
                    searchResults.sort((a, b) => {
                        const dxa = Math.abs(a.geometry.coordinates[0]) - Math.abs(geo.lon)
                        const dya = Math.abs(a.geometry.coordinates[1]) - Math.abs(geo.lat)
                        const da = Math.pow(dxa, 2) + Math.pow(dya, 2)

                        const dxb = Math.abs(b.geometry.coordinates[0]) - Math.abs(geo.lon)
                        const dyb = Math.abs(b.geometry.coordinates[1]) - Math.abs(geo.lat)
                        const db = Math.pow(dxb, 2) + Math.pow(dyb, 2)

                        const d = da - db

                        return d
                    })

                    for (const r of searchResults) {
                        const dxa = Math.abs(r.geometry.coordinates[0]) - Math.abs(geo.lon)
                        const dya = Math.abs(r.geometry.coordinates[1]) - Math.abs(geo.lat)
                        const da = Math.pow(dxa, 2) + Math.pow(dya, 2)
                        results += `\t- Name: ${r.name}\n`// \nDistance: ${Math.floor(Math.sqrt(da) * 100) / 100 } km`
                    }
                }
            }
        }

        const resultPrompt =
`When referencing a hotel in the response, apply a bold html markup.  Use the exact text of the document as evidence of the response.  Only answer questions based on the document text.  If the answer is not in the text, state that you don't know. 

Question : {query}
Documents : 
{docs}
Response : `
        const resultChain = new LLMChain({ prompt: this.getPrompt(resultPrompt), llm: llm })
        //const docTextArray = docs.map(v => {return `name : ${v.metadata.name}\nshort description : ${v.metadata.shortDescription} ` })
    
        console.log(await this.getPrompt(resultPrompt).format({ query: query, docs: docText, previous_answer: previousAnswer }))
        const resultText = await resultChain.call({ query: query, docs: docText, previous_answer: previousAnswer })

        return { text: resultText, sourceDocuments: docs }
    }
}