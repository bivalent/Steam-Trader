import React, { Component } from 'react'
import { Container, Row, Col } from 'reactstrap'
import ModalForm from './Components/Modals/Modal'
import DataTable from './Components/Tables/DataTable'
import { CSVLink } from "react-csv"

class App extends Component {
  state = {
    trades: []
  }

  getTrades(){
    fetch('http://localhost:3000/crud')
      .then(response => response.json())
      .then(trades => this.setState({trades}))
      .catch(err => console.log(err))
  }

  addTradeToState = (trade) => {
    this.setState(prevState => ({
      trades: [...prevState.trades, trade]
    }))
  }

  updateState = (trade) => {
    const tradeIndex = this.state.trades.findIndex(data => data.trade_id === trade.trade_id)
    const newArray = [
    // destructure all trades from beginning to the indexed trade
      ...this.state.trades.slice(0, tradeIndex),
    // add the updated trade to the array
      trade,
    // add the rest of the trades to the array from the index after the replaced trade
      ...this.state.trades.slice(tradeIndex + 1)
    ]
    this.setState({ trades: newArray })
  }

  deleteTradeFromState = (trade_id) => {
    const updatedTrades = this.state.trades.filter(trade => trade.trade_id !== trade_id)
    this.setState({ trades: updatedTrades })
  }

  componentDidMount(){
    this.getTrades()
  }

  render() {
    return (
      <Container className="App">
        <Row>
          <Col>
            <h1 style={{margin: "20px 0"}}>Steam Trader</h1>
          </Col>
        </Row>
        <Row>
          <Col>
            <DataTable trades={this.state.trades} updateState={this.updateState} deleteTradeFromState={this.deleteTradeFromState} />
          </Col>
        </Row>
        <Row>
          <Col>
            <CSVLink
              filename={"db.csv"}
              color="primary"
              style={{float: "left", marginRight: "10px"}}
              className="btn btn-primary"
              data={this.state.trades}>
              Download CSV
            </CSVLink>
            <ModalForm buttonLabel="Add Trade" addTradeToState={this.addTradeToState}/>
          </Col>
        </Row>
      </Container>
    )
  }
}

export default App
