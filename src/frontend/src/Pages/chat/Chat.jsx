import { useRef, useState, useEffect } from "react";
import { Panel, DefaultButton, SpinButton, TextField, Text } from "@fluentui/react";
//import { SparkleFilled } from "@fluentui/react-icons";
import { Button, Dropdown } from '@fluentui/react-northstar';
import styles from "./Chat.module.css";



import { chatApi } from "./api";
import { Answer, AnswerError, AnswerLoading } from "./components/Answer";
import { QuestionInput } from "./components/QuestionInput";
//import { ExampleList } from "./components/Example";
import { UserChatMessage } from "./components/UserChatMessage";
import { AnalysisPanel, AnalysisPanelTabs } from "./components/AnalysisPanel";
import { SettingsButton } from "./components/SettingsButton";
import { ClearChatButton } from "./components/ClearChatButton";
import axios from 'axios'


// export const enum Approaches {
//     RetrieveThenRead = "rtr",
//     ReadRetrieveRead = "rrr",
//     ReadDecomposeAsk = "rda"
// }

const chainTypes = [
    "refine",
    "stuff",
    "map_reduce",
    "geolocation",
    "hotelqa"
]

const agentTypes = [
    "plan-and-execute",
    "chat-zero-shot-react-description",
    "zero-shot-react-description"
]

const processTypes = [
    {
        name: "chain",
        chainTypes: chainTypes
    },
    {
        name: "agent",
        agentTypes: agentTypes,
        chainTypes: chainTypes
    },
    {
        name: "Use Your Own Data (Azure API)",
        agentTypes: [],
        chainTypes: []
    }
]

const EnterpriseSearch = () => {
    const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
    //const [promptTemplate, setPromptTemplate] = useState("");
    // const [facetTemplate, setFacetTemplate] = useState("If the question is asking about 'sentiment' regarding the sources and other documents in the database, use the 'Facets' field to answer the question.");
    // const [facetQueryTermsTemplate, setFacetQueryTermsTemplate] = useState("When generating the Search Query do not use terms related to sentiment.  Example ['sentiment', 'positive', 'negative',etc]");
    const [retrieveCount, setRetrieveCount] = useState(3);
    //const [useSemanticRanker, setUseSemanticRanker] = useState(true);
    // const [vectorSearchPipeline, setVectorSearchPipeline] = useState("");
    //const [useSemanticCaptions, setUseSemanticCaptions] = useState(false);
    //const [excludeCategory, setExcludeCategory] = useState("");
    //const [useSuggestFollowupQuestions, setUseSuggestFollowupQuestions] = useState(false);

    const lastQuestionRef = useRef("");
    const chatMessageStreamEnd = useRef(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [activeCitation, setActiveCitation] = useState(null);
    const [activeAnalysisPanelTab, setActiveAnalysisPanelTab] = useState(undefined);

    const [selectedAnswer, setSelectedAnswer] = useState(0);
    const [answers, setAnswers] = useState([]);

    const [indexes, setIndexes] = useState([])
    const [selectedIndex, setSelectedIndex] = useState(null)
    //const [indexSearchDone, setIndexSearchDone] = useState(false)
    // const [pipelines, setPipelines] = useState([])
    const [processType, setProcessType] = useState(processTypes[0].name)
    const [agentType, setAgentType] = useState(agentTypes[0])
    const [chainType, setChainType] = useState(chainTypes[0])
    const [tools, setTools] = useState([])
    const [toolName, setToolName] = useState("")
    const [toolDescription, setToolDescription] = useState("")
    const [refinePrompt, setRefinePrompt] = useState(`
    Question: {question}
        Chat History:{chat_history}
        Document: {context} 
        Existing Answer: {existing_answer}
        Each document contains information for a single hotel.  If the information is relevant to the question and chat history, refine the existing answer. Only update the existing answer with information from the document.`)
    const [refineQuestionPrompt, setRefineQuestionPrompt] = useState(`Based on the chat history and question, create a new query.
    Question: {question}
    Chat History: {chat_history}
    New Query:`)
    const [mrCombineMapPrompt, setMrCombineMapPrompt] = useState(`I'm a virtual assistant that answers questions based on documents that are returned.  I will only information that is within the context of the document.
    Document : {context} 
    Question : {question}
    Chat History: {chat_history}
    Answer:`)
    const [mrCombinePrompt, setMrCombinePrompt] = useState(`I'm a virtual assistant that answers questions based on documents that are returned.  I will only information that is within the context of the document.
    Document : {summaries} 
    Question : {question}
    Chat History: {chat_history}
    Answer:`)
    const [questionGenerationPrompt, setQuestionGenerationPrompt] = useState(`Based on the chat history and question, create a new query.  Convert state abbreviations to the full form.  Example: PA to Pennsylvania.
    Question: {question}
    Chat History: {chat_history}
    New Query:`)
    const [stuffPrompt, setStuffPrompt] = useState(`Based on the Question and Completed Steps return one of the following: [completed, search_hotels, hotel_information, completed]

    Rules:
    
    - if the question is not about hotels, hotel locations, events near a hotel, or information about a hotel, return not_in_scope.
    
    - if a list of hotels exists in the Completed Steps, return completed
    
    - if there is not a list of hotels in the Completed Steps, return search_hotels
    
    - if the question is asking for additional information about a group of hotels and the hotels exist in the Completed Steps, return hotel_information
    
    Examples:
    
         Question: "show me hotels near raleigh, nc" 
         Completed Steps: Hotels: 
        - Name: Linyi West 
        - Name: Danville 
        - Name: Charlotte NE - University Area 
        Result: completed<stop>
    
         Question: "show me hotels near raleigh, nc" 
         Completed Steps: 
        Result: search_hotels<stop>
    
         Question: "what is the parking policy?" 
         Completed Steps: Hotels: 
        - Name: Linyi West 
        - Name: Danville 
        - Name: Charlotte NE - University Area 
        Result: hotel_information<stop>
    
         Question: "is wifi available?" 
         Completed Steps: Hotels: 
        - Name: Linyi West 
        - Name: Danville 
        - Name: Charlotte NE - University Area 
        Result: hotel_information<stop>
    
        Question: "is wifi available?" 
         Completed Steps: 
        Result: search_hotels<stop>
    
         Question: "i need some hotels near Pittsburgh that have ample parking" 
         Completed Steps: Hotels: 
        - Name: Linyi West 
        - Name: Danville 
        - Name: Charlotte NE - University Area 
    
             Information:
             - Linyi West : Parking is not 

Question: "what is the pet policy?"
    
         Completed Steps:
         
show me hotels near raleigh

Hotels: 
	- Name: Linyi West 
	- Name: Danville 
	- Name: Charlotte NE - University Area 


what is the pet policy?

Something went wrong. AbortError

         
Information: 

	- Linyi West : No pets are allowed.


	- Danville : Pets are allowed with a non-refundable fee of $75 per stay. The limit is 2 pets per pet-friendly room with a weight limit of 50 lbs. Pets are not allowed in the breakfast area.


	- Charlotte NE - University Area : The document does not provide information about the pet policy.



    
         Result: completed<stop>


             - Danville : There is no mention of parking in the document
             - Charlotte NE - University Area : There is no mention of parking in the document
        Result: completed<stop>
    
         Question: "what is the pet policy for hotels near raleigh" 
         Completed Steps: Hotels: 
        - Name: Linyi West 
        - Name: Danville 
        - Name: Charlotte NE - University Area 
    
             Information:
             - Linyi West : Service pets are welcome.
             - Danville : There is no mention of pets in the document
             - Charlotte NE - University Area : There is no mention of petsin the document
        Result: completed<stop>
    
    Question: "what is the parking policy?" 
         Completed Steps: Hotels: 
        - Name: Linyi West 
        - Name: Danville 
        - Name: Charlotte NE - University Area 
        Result: hotel_information<stop>
    
         Question: "what are the pet policies for hotels near austin, tx" 
         Completed Steps: Hotels: 
        - Name: Linyi West 
        - Name: Danville 
        - Name: Charlotte NE - University Area 
        Result: hotel_information<stop>



    
         Question: "what are the pet policies for hotels near austin, tx" 
         Completed Steps: 
        Result: search_hotels<stop>
    
    
         Question: "is a cat a mammal?" 
         Completed Steps: 
        Result: not_in_scope<stop>
    
    
         Question: "i need a hotel near disney world with ample parking." 
         Completed Steps: Hotels: 
        - Name: Linyi West 
        - Name: Danville 
        - Name: Charlotte NE - University Area 
        Result: hotel_information<stop>
    
         Question: "my cousin needs to borrow money" 
         Completed Steps: Hotels: 
        - Name: Linyi West 
        - Name: Danville 
        - Name: Charlotte NE - University Area 
        Information:
             - Linyi West : Parking is not available
             - Danville : There is no mention of parking in the document
             - Charlotte NE - University Area : There is no mention of parking in the document
        Result:  not_in_scope
    
    
         Question: "{input}"
    
         Completed Steps:
         {history}
         {steps}
    
         Result:`
    )



    useEffect(() => {
        axios.get('/api/indexes').then(_indexes => {
            if (_indexes?.data?.indexes) {
                setIndexes(_indexes.data.indexes)
                setSelectedIndex(_indexes.data.indexes[0])

                const llmConfig = {
                    temperature: 0.1,
                    topP: 0,
                    frequencyPenalty: 0.1,
                    presencePenalty: 0,
                    n: 1,
                    streaming: false,
                    modelName: "gpt-3.5-turbo-16k",
                    maxConcurrency: 1
                }

                const indexConfig = {

                    "name": "hotelswithzipgeo-index",
                    "facetableFields": [],
                    "searchableFields": [
                        "profile/shortDescription",
                        "profile/longDescription",
                        "address/state/name",
                        "address/zip",
                        "policies/pet/description",
                        "parking/parkingDescription",
                        "marketing/marketingText/hotelMajorFeature",
                        "marketing/marketingText/mustDo",
                        "marketing/marketingText/mustSee",
                        "marketing/marketingText/whatsNew",
                        "marketing/welcomeMessage",
                        "location/introText"
                    ],
                    "collections": [],
                    "semanticConfigurations": [
                        {
                            "name": "default",
                            "prioritizedFields": {
                                "titleField": {
                                    "fieldName": "profile/name"
                                },
                                "prioritizedContentFields": [
                                    {
                                        "fieldName": "profile/shortDescription"
                                    },
                                    {
                                        "fieldName": "profile/longDescription"
                                    },
                                    {
                                        "fieldName": "address/state/name"
                                    },
                                    {
                                        "fieldName": "address/zip"
                                    },
                                    {
                                        "fieldName": "policies/pet/description"
                                    },
                                    {
                                        "fieldName": "parking/parkingDescription"
                                    },
                                    {
                                        "fieldName": "marketing/marketingText/hotelMajorFeature"
                                    },
                                    {
                                        "fieldName": "marketing/marketingText/mustDo"
                                    },
                                    {
                                        "fieldName": "marketing/marketingText/mustSee"
                                    },
                                    {
                                        "fieldName": "marketing/marketingText/whatsNew"
                                    }
                                ],
                                "prioritizedKeywordsFields": []
                            }
                        }
                    ]
                }

                const geolocation = {
                    name: "search_hotels",
                    description: "Search for hotels based on location.  Use this tool if it is a list of hotels is not available in the Question or Completed Steps.",
                    memorySize: 10,
                    chainParameters: {
                        type: "geolocation",
                        memorySize: 10,
                        llmConfig: llmConfig,
                        retriever: {
                            type: "cogsearch",
                            indexConfig: indexConfig,
                            numDocs: 3
                        },
                        stuffPrompt: stuffPrompt,
                        refinePrompt: refinePrompt,
                        refineQuestionPrompt: refineQuestionPrompt,
                        mrCombineMapPrompt: mrCombineMapPrompt,
                        mrCombinePrompt: mrCombinePrompt,
                        questionGenerationPrompt: questionGenerationPrompt
                    }
                }

                const hotelqa = {
                    name: "hotel_information",
                    description: "Answer questions about hotels.  A list of hotels is required in the Completed Steps to use this tool.  If there is a hotel_questions output in the Completed Steps, return \"completed\"",
                    memorySize: 10,
                    chainParameters: {
                        type: "hotelqa",
                        memorySize: 10,
                        llmConfig: llmConfig,
                        retriever: {
                            type: "cogsearch",
                            indexConfig: indexConfig,
                            numDocs: 3
                        },
                        stuffPrompt: stuffPrompt,
                        refinePrompt: refinePrompt,
                        refineQuestionPrompt: refineQuestionPrompt,
                        mrCombineMapPrompt: mrCombineMapPrompt,
                        mrCombinePrompt: mrCombinePrompt,
                        questionGenerationPrompt: questionGenerationPrompt
                    }
                }
                setTools([geolocation, hotelqa])
            }
        }).catch(err => {
            console.log(err)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const generatePipeline = () => {
        const llmConfig = {
            temperature: 0.1,
            topP: 0,
            frequencyPenalty: 0.1,
            presencePenalty: 0,
            n: 1,
            streaming: false,
            modelName: "gpt-3.5-turbo-16k",
            maxConcurrency: 1
        }

        let pipeline = {}


        if (processType === 'chain') {
            pipeline = {
                name: "first",
                type: "chain",
                subType: "RetrievalQA",
                chainParameters: {
                    type: chainType,
                    memorySize: 10,
                    llmConfig: llmConfig,
                    retriever: {
                        type: "cogsearch",
                        indexConfig: selectedIndex,
                        numDocs: retrieveCount
                    },
                    stuffPrompt: stuffPrompt,
                    refinePrompt: refinePrompt,
                    refineQuestionPrompt: refineQuestionPrompt,
                    mrCombineMapPrompt: mrCombineMapPrompt,
                    mrCombinePrompt: mrCombinePrompt,
                    questionGenerationPrompt: questionGenerationPrompt
                }
            }
        } else if (processType === 'agent') {
            pipeline = {
                name: "agent",
                type: "agent",
                subType: agentType,
                prompt: stuffPrompt,
                parameters: {
                    tools: tools,
                }
            }

        } else {
            pipeline = {
                name: "default"
            }
        }
        return pipeline
    }


    const onIndexChange = (_, value) => {
        if (indexes && indexes.length > 0) {
            const _index = indexes.find(i => i.name === value.value)
            setSelectedIndex(_index)
        }

    }

    const onProcessChange = (_, value) => {
        setProcessType(value.value)
    }

    const onChainChange = (_, value) => {
        setChainType(value.value)
    }

    const onAgentChange = (_, value) => {
        setAgentType(value.value)
    }

    const onChangeToolName = (_, value) => {
        setToolName(value)
    }

    const onChangeToolDescription = (_, value) => {
        setToolDescription(value)
    }

    const onChangeMrCombineMapPrompt = (_, value) => {
        setMrCombineMapPrompt(value)
    }
    const onChangeMrCombinePrompt = (_, value) => {
        setMrCombinePrompt(value)
    }
    const onChangeQuestionGenerationPrompt = (_, value) => {
        setQuestionGenerationPrompt(value)
    }
    const onChangeRefinePrompt = (_, value) => {
        setRefinePrompt(value)
    }
    const onChangeRefineQuestionPrompt = (_, value) => {
        setRefineQuestionPrompt(value)
    }
    const onChangeStuffPrompt = (_, value) => {
        setStuffPrompt(value)
    }

    const onResetTools = () => {
        setTools([])
    }

    const onAddTool = () => {
        const llmConfig = {
            temperature: 0.1,
            topP: 0,
            frequencyPenalty: 0.1,
            presencePenalty: 0,
            n: 1,
            streaming: false,
            modelName: "gpt-3.5-turbo-16k",
            maxConcurrency: 1
        }

        const newTool = {
            name: toolName,
            description: toolDescription,
            memorySize: 10,
            chainParameters: {
                type: chainType,
                memorySize: 10,
                llmConfig: llmConfig,
                retriever: {
                    type: "cogsearch",
                    indexConfig: selectedIndex,
                    numDocs: retrieveCount
                },
                stuffPrompt: stuffPrompt,
                refinePrompt: refinePrompt,
                refineQuestionPrompt: refineQuestionPrompt,
                mrCombineMapPrompt: mrCombineMapPrompt,
                mrCombinePrompt: mrCombinePrompt,
                questionGenerationPrompt: questionGenerationPrompt
            }
        }
        const _tools = []
        for (const t of tools) {
            _tools.push(t)
        }
        _tools.push(newTool)
        setTools(_tools)
    }

    const makeApiRequest = (question => {
        lastQuestionRef.current = question;

        error && setError(undefined);
        setIsLoading(true);
        setActiveCitation(undefined);
        setActiveAnalysisPanelTab(undefined);

        try {
            const history = answers.map(a => ({ user: a[0], assistant: a[1].answer }));
            const request = {
                history: [...history, { user: question, assistant: undefined }],
                approach: "rtr", //not being used but kept for consistency
                pipeline: generatePipeline(),
                overrides: {
                    //promptTemplate: promptTemplate.length === 0 ? undefined : promptTemplate,
                    //excludeCategory: excludeCategory.length === 0 ? undefined : excludeCategory,
                    top: retrieveCount,
                    //semanticRanker: useSemanticRanker,
                    //vectorSearchPipeline: vectorSearchPipeline,
                    //semanticCaptions: useSemanticCaptions,
                    //suggestFollowupQuestions: useSuggestFollowupQuestions,
                    //facetQueryTermsTemplate: facetQueryTermsTemplate,
                    //facetTemplate : facetTemplate
                },
                index: selectedIndex
            };
            chatApi(request).then(result => {
                setAnswers([...answers, [question, result]]);
                setIsLoading(false);
            })

        } catch (e) {
            setError(e);
        } finally {
            //setIsLoading(false);
        }
    });


    const clearChat = () => {
        lastQuestionRef.current = "";
        error && setError(undefined);
        setActiveCitation(undefined);
        setActiveAnalysisPanelTab(undefined);
        setAnswers([]);
    };

    useEffect(() => chatMessageStreamEnd.current?.scrollIntoView({ behavior: "smooth" }), [isLoading]);

    const onRetrieveCountChange = (_ev, newValue) => {
        setRetrieveCount(parseInt(newValue || "3"));
    };

    const onShowCitation = (citation, index) => {
        if (activeCitation === citation && activeAnalysisPanelTab === AnalysisPanelTabs.CitationTab && selectedAnswer === index) {
            setActiveAnalysisPanelTab(undefined);
        } else {
            setActiveCitation(citation);
            setActiveAnalysisPanelTab(AnalysisPanelTabs.CitationTab);
        }

        setSelectedAnswer(index);
    };

    const onToggleTab = (tab, index) => {
        if (activeAnalysisPanelTab === tab && selectedAnswer === index) {
            setActiveAnalysisPanelTab(undefined);
        } else {
            setActiveAnalysisPanelTab(tab);
        }

        setSelectedAnswer(index);
    };

    const renderTools = () => {
        if (tools) {
            return (
                <ul>
                    {tools.map(t => (<li>{t.name}</li>))}
                </ul>)
        }
    }

    const renderDefaultComponents = () => {
        return (
            <>
                <SpinButton
                    className={styles.chatSettingsSeparator}
                    label="Retrieve this many documents from search:"
                    min={1}
                    max={50}
                    defaultValue={retrieveCount.toString()}
                    onChange={onRetrieveCountChange}
                    style={{ marginBottom: "20px" }}
                />

                <Dropdown
                    placeholder="Select the Process Type"
                    label="Process Type"
                    items={processTypes.map(p => p.name)}
                    onChange={onProcessChange}
                    value={processType}
                    style={{ marginBottom: "20px" }}
                />

                <Dropdown
                    placeholder="Select the Cognitive Search Index"
                    label="Output"
                    items={indexes.map(sc => sc.name)}
                    value={selectedIndex ? selectedIndex.name : ""}
                    onChange={onIndexChange}
                    style={{ marginBottom: "20px" }}
                />
            </>
        )
    }

    const renderPrompts = () => {
        if (chainType === 'stuff') {
            return (
                <>
                    <TextField
                        className={styles.chatSettingsSeparator}
                        value={stuffPrompt}
                        label="Stuff Chain Prompt Template': "
                        multiline
                        autoAdjustHeight
                        onChange={onChangeStuffPrompt}
                        style={{ marginBottom: "20px" }}
                    />
                    <TextField
                        className={styles.chatSettingsSeparator}
                        value={questionGenerationPrompt}
                        label="Question Generator Prompt Template': "
                        multiline
                        autoAdjustHeight
                        onChange={onChangeQuestionGenerationPrompt}
                        style={{ marginBottom: "20px" }}
                    />
                </>

            )
        }

        if (chainType === 'refine') {
            return (
                <>
                    <TextField
                        className={styles.chatSettingsSeparator}
                        value={refinePrompt}
                        label="Refine Chain Prompt Template': "
                        multiline
                        autoAdjustHeight
                        onChange={onChangeRefinePrompt}
                        style={{ marginBottom: "20px" }}
                    />
                    <TextField
                        className={styles.chatSettingsSeparator}
                        value={refineQuestionPrompt}
                        label="Refine Chain Question Prompt Template': "
                        multiline
                        autoAdjustHeight
                        onChange={onChangeRefineQuestionPrompt}
                        style={{ marginBottom: "20px" }}
                    />
                    <TextField
                        className={styles.chatSettingsSeparator}
                        value={questionGenerationPrompt}
                        label="Question Generator Prompt Template': "
                        multiline
                        autoAdjustHeight
                        onChange={onChangeQuestionGenerationPrompt}
                        style={{ marginBottom: "20px" }}
                    />
                </>

            )
        }

        if (chainType === 'map_reduce') {
            return (
                <>
                    <TextField
                        className={styles.chatSettingsSeparator}
                        value={mrCombineMapPrompt}
                        label="MapReduce Combine Map Prompt Template': "
                        multiline
                        autoAdjustHeight
                        onChange={onChangeMrCombineMapPrompt}
                        style={{ marginBottom: "20px" }}
                    />
                    <TextField
                        className={styles.chatSettingsSeparator}
                        value={mrCombinePrompt}
                        label="Map Reduce Combine Prompt Template': "
                        multiline
                        autoAdjustHeight
                        onChange={onChangeMrCombinePrompt}
                        style={{ marginBottom: "20px" }}
                    />
                    <TextField
                        className={styles.chatSettingsSeparator}
                        value={questionGenerationPrompt}
                        label="Question Generator Prompt Template': "
                        multiline
                        autoAdjustHeight
                        onChange={onChangeQuestionGenerationPrompt}
                        style={{ marginBottom: "20px" }}
                    />
                </>

            )
        }
    }

    const renderComponents = () => {
        if (processType === 'agent') {
            return (<div style={{ display: "flex", flexDirection: "column" }}>
                {renderDefaultComponents()}
                <Dropdown
                    placeholder="Select the Agent Type"
                    label="Agent Type"
                    items={agentTypes}
                    onChange={onAgentChange}
                    style={{ marginBottom: "20px" }}
                    value={agentType}
                />
                <TextField
                    className={styles.chatSettingsSeparator}
                    value={toolName}
                    label="Tool Name: "
                    multiline
                    autoAdjustHeight
                    onChange={onChangeToolName}
                    style={{ marginBottom: "20px" }}
                />
                <TextField
                    className={styles.chatSettingsSeparator}
                    value={toolDescription}
                    label="Tool Description: "
                    multiline
                    autoAdjustHeight
                    onChange={onChangeToolDescription}
                    style={{ marginBottom: "20px" }}
                />

                <Dropdown
                    placeholder="Select the Chain Type"
                    label="Chain Type"
                    items={chainTypes}
                    onChange={onChainChange}
                    style={{ marginBottom: "20px", marginTop: "20px" }}
                    value={chainType}
                />
                {renderPrompts()}


                <Button primary content="Add Tool"
                    style={{ marginBottom: "20px" }}
                    disabled={processType !== 'agent'}
                    onClick={onAddTool}
                />

                <Button primary content="Reset Tools"
                    style={{ marginBottom: "20px" }}
                    disabled={processType !== 'agent'}
                    onClick={onResetTools}
                />

                <Text style={{ marginBottom: "20px" }}> List of Tools : {renderTools()} </Text>
            </div>
            )
        } else if (processType === 'chain') {
            return (
                <>
                    {renderDefaultComponents()}
                    <Dropdown
                        placeholder="Select the Chain Type"
                        label="Chain Type"
                        items={chainTypes}
                        onChange={onChainChange}
                        value={chainType}
                        style={{ marginBottom: "20px", marginTop: "20px" }}
                    />
                    {renderPrompts()}
                </>
            )
        } else {
            return (<>{renderDefaultComponents()}</>)
        }
    }

    return (
        <div className={styles.container}>

            <div className={styles.commandsContainer}>
                <ClearChatButton className={styles.commandButton} onClick={clearChat} disabled={!lastQuestionRef.current || isLoading} />
                <SettingsButton className={styles.commandButton} onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)} />
            </div>
            <div className={styles.chatRoot}>

                <div className={styles.chatContainer}>
                    {!lastQuestionRef.current ? (
                        <div className={styles.chatEmptyState}>
                            {/* <SparkleFilled fontSize={"120px"} primaryFill={"rgba(115, 118, 225, 1)"} aria-hidden="true" aria-label="Chat logo" /> */}
                            <h1 className={styles.chatEmptyStateTitle}>Chat with your data</h1>
                            {/* <h2 className={styles.chatEmptyStateSubtitle}>Ask anything or try an example</h2>
                            <ExampleList onExampleClicked={onExampleClicked} /> */}
                        </div>
                    ) : (
                        <div className={styles.chatMessageStream}>
                            {answers.map((answer, index) => (
                                <div key={index}>
                                    <UserChatMessage message={answer[0]} />
                                    <div className={styles.chatMessageGpt}>
                                        <Answer
                                            key={index}
                                            answer={answer[1]}
                                            isSelected={selectedAnswer === index && activeAnalysisPanelTab !== undefined}
                                            onCitationClicked={c => onShowCitation(c, index)}
                                            onThoughtProcessClicked={() => onToggleTab(AnalysisPanelTabs.ThoughtProcessTab, index)}
                                            onSupportingContentClicked={() => onToggleTab(AnalysisPanelTabs.SupportingContentTab, index)}
                                            onFollowupQuestionClicked={q => makeApiRequest(q)}
                                        //showFollowupQuestions={useSuggestFollowupQuestions && answers.length - 1 === index}
                                        />
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <>
                                    <UserChatMessage message={lastQuestionRef.current} />
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerLoading />
                                    </div>
                                </>
                            )}
                            {error ? (
                                <>
                                    <UserChatMessage message={lastQuestionRef.current} />
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerError error={error.toString()} onRetry={() => makeApiRequest(lastQuestionRef.current)} />
                                    </div>
                                </>
                            ) : null}
                            <div ref={chatMessageStreamEnd} />
                        </div>
                    )}

                    <div className={styles.chatInput}>
                        <QuestionInput
                            clearOnSend
                            placeholder="Type a new question"
                            disabled={isLoading}
                            onSend={question => makeApiRequest(question)}
                        />
                    </div>
                </div>

                {answers.length > 0 && activeAnalysisPanelTab && (
                    <AnalysisPanel
                        className={styles.chatAnalysisPanel}
                        activeCitation={activeCitation}
                        onActiveTabChanged={x => onToggleTab(x, selectedAnswer)}
                        citationHeight="810px"
                        answer={answers[selectedAnswer][1]}
                        activeTab={activeAnalysisPanelTab}
                        selectedIndex={selectedIndex}
                    />
                )}

                <Panel
                    headerText="Configure answer generation"
                    isOpen={isConfigPanelOpen}
                    isBlocking={false}
                    onDismiss={() => setIsConfigPanelOpen(false)}
                    closeButtonAriaLabel="Close"
                    onRenderFooterContent={() => <DefaultButton onClick={() => setIsConfigPanelOpen(false)}>Close</DefaultButton>}
                    isFooterAtBottom={true}
                >
                    <div >
                        {renderComponents()}
                    </div>
                </Panel>
            </div>
        </div>
    );
};

export default EnterpriseSearch;
